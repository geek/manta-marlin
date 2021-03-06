/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * lib/worker/locator.js: interface for locating Manta objects.
 */

var mod_assert = require('assert');
var mod_events = require('events');
var mod_fs = require('fs');
var mod_util = require('util');

var mod_extsprintf = require('extsprintf');
var mod_jsprim = require('jsprim');
var mod_libmanta = require('libmanta');
var mod_uuid = require('node-uuid');
var mod_vasync = require('vasync');

var mod_mautil = require('../util');

var sprintf = mod_extsprintf.sprintf;
var CVError = mod_mautil.CVError;

/* jsl:import ../../../common/lib/errors.js */
require('../errors');

/* Public interface */
exports.createLocator = createLocator;

/*
 * Locators are objects with a single method for locating a set of keys in
 * Manta:
 *
 *	locate(keys, callback)
 *
 * "keys" is an array of Manta object keys.  "callback" is invoked later as
 * callback(err, results), where "results" is an object mapping the input keys
 * to a JS object describing the Manta object, including all copies of the
 * object on the storage tier.  The object has:
 *
 *      creator			The account that originally created the object,
 *      			or "owner" if "creator" isn't present in Moray.
 *
 *      owner			The account that owns this name for the object.
 *
 *      objectid		Unique identifier for this object.  This value
 *      			is the same for all copies of this object.
 *
 *      contentLength		The size of this object.
 *
 *      sharks			Array of locations for this object.  Each
 *      			element will have:
 *
 *      	mantaStorageId	identifier for the shark containing the object
 *
 *          Elements MAY also have the following:
 *
 *              mantaComputeId	identifier for the agent that can operate on
 *              		this copy of the object.  If null, that
 *              		identifier is unkown.
 *
 *              zonename	zonename for the shark, which is necessary to
 *              		tell the agent where the object is actually
 *              		stored.  If null, the zone name is unknown.
 *
 * We currently only implement a Manta-based locator which is used for standard
 * deployments.  This locator takes a ring of Moray shards as input and uses
 * them to locate objects.  For future extension, createLocator is used to
 * create an appropriate locator for a given configuration, which is a subset of
 * the standard job worker configuration with the following properties:
 *
 *    locator	The default value is "manta".  See above.
 *
 *    moray	Moray configuration (see generic worker configuration)
 *
 *	moray.index: electric moray configuration
 *
 * The locator will use the electric moray instance specified by
 * moray.index.{host,port} to find objects.
 */
function createLocator(conf, args)
{
	if (!conf['locator'] || conf['locator'] == 'manta') {
		mod_assert.ok(conf['moray']);
		mod_assert.ok(conf['moray']['index']);
		return (new MantaLocator(conf['moray']['index'],
		    args['log'], args['storage_map']));
	}

	throw (new Error('unsupported value for property "locator": ' +
	    conf['locator']));
}

function MantaLocator(indexconf, log, storage_map)
{
	mod_assert.ok(indexconf);

	var conf = mod_jsprim.deepCopy(indexconf);
	conf['log'] = log;

	this.ml_log = log;
	this.ml_ring = mod_libmanta.createMorayClient(conf);
	this.ml_ops = {};
	this.ml_storage_map = storage_map;
	mod_events.EventEmitter();

	var loc = this;

	/*
	 * We don't handle the error event.  libmanta is responsible for
	 * reconnecting, and most other errors are per-request.  A "ring" error
	 * represents some more serious issue that we cannot reasonably handle.
	 */
	this.ml_ring.once('connect', function () {
		loc.ml_log.info('locator ready');
		loc.emit('ready');
	});
}

mod_util.inherits(MantaLocator, mod_events.EventEmitter);

/*
 * Guarantees that the shark data always contains:
 *    zonename
 *    mantaComputeId
 *    mantaStorageId
 */
function populateSharkData(locator, result, shark) {
	var rec = locator.ml_storage_map[shark['manta_storage_id']];
	return ({
		'mantaStorageId': shark['manta_storage_id'],
		'mantaComputeId': rec ? rec['manta_compute_id'] : null,
		'zonename': rec ? rec['zone_uuid'] : null
	});
}

MantaLocator.prototype.locate = function (keys, callback)
{
	/*
	 * For now this operation uses mod_vasync to parallelize one request for
	 * each key.  In the future, this could be a single batch operation.
	 */
	var loc = this;
	var uuid = mod_uuid.v4();
	var ring = this.ml_ring;
	var ops = this.ml_ops;

	this.ml_ops[uuid] = mod_vasync.forEachParallel({
	    'inputs': keys,
	    'func': function (key, subcallback) {
		/* XXX requestid could be jobid, plus phase, plus index? */
		ring.getMetadata({ 'requestId': uuid, 'key': key },
		    function (err, result) {
			if ((err && err['name'] == 'ObjectNotFoundError')) {
				subcallback(new CVError(EM_RESOURCENOTFOUND,
				    'no such object'));
				return;
			}

			if (err) {
				subcallback(new CVError(EM_INTERNAL, err,
				    'error locating object'));
				return;
			}

			if (result['type'] != 'object') {
				subcallback(new CVError(EM_INVALIDARGUMENT,
				    'objects of type "%s" are not supported',
				    result['type']));
				return;
			}

			if (!result['sharks'] ||
			    !Array.isArray(result['sharks'])) {
				subcallback(new CVError(EM_INTERNAL,
				    'missing or invalid "sharks" property'));
				return;
			}

			if (result['sharks'].length === 0 &&
			    result['contentLength'] !== 0) {
				subcallback(new CVError(EM_INTERNAL,
				    'no sharks found for non-empty object'));
				return;
			}

			subcallback(null, {
			    'creator': result['creator'] || result['owner'],
			    'owner': result['owner'],
			    'objectid': result['objectId'],
			    'contentLength': result['contentLength'],
			    'roles': result['roles'],
			    'sharks': result['sharks'].map(function (s) {
				return (populateSharkData(loc, result, s));
			    })
			});
		    });
	    }
	}, function (err, result) {
		delete (ops[uuid]);

		var rv = {};

		keys.forEach(function (key, i) {
			if (result['operations'][i]['status'] != 'ok') {
				rv[key] = { 'error':
				    result['operations'][i]['err'] };
				return;
			}

			rv[key] = result['operations'][i]['result'];
		});

		callback(err, rv);
	});
};

MantaLocator.prototype.cleanup = function ()
{
	this.ml_ring.close(function () {});
};
