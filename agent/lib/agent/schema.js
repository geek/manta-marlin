/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2014, Joyent, Inc.
 */

/*
 * lib/agent/schema.js: agent configuration schema
 */

var mod_schema = require('../schema');

module.exports = {
    'type': 'object',
    'properties': {
	'instanceUuid': mod_schema.sStringRequiredNonEmpty,
	'mantaComputeId': mod_schema.sStringRequiredNonEmpty,
	'port': mod_schema.sTcpPortRequired,

	'manta': {
	    'type': 'object',
	    'required': true,
	    'properties': {
		'url': mod_schema.sStringRequiredNonEmpty
	    }
	},

	'moray': {
	    'type': 'object',
	    'required': true,
	    'properties': {
		'url': mod_schema.sStringRequiredNonEmpty,
		'reconnect': {
		    'required': true,
		    'type': 'object',
		    'properties': {
			'maxTimeout': mod_schema.sIntervalRequired,
			'retries': mod_schema.sIntervalRequired
		    }
		}
	    }
	},

	'dns': {
	    'type': 'object',
	    'required': true,
	    'properties': {
		'nameservers': {
		    'type': 'array',
		    'items': mod_schema.sStringRequiredNonEmpty,
		    'minItems': 1
		},
		'triggerInterval': mod_schema.sIntervalRequired,
		'graceInterval':   mod_schema.sIntervalRequired
	    }
	},

	'buckets': {
	    'type': 'object',
	    'required': true,
	    'properties': {
		'error': mod_schema.sStringRequiredNonEmpty,
		'health': mod_schema.sStringRequiredNonEmpty,
		'job': mod_schema.sStringRequiredNonEmpty,
		'task': mod_schema.sStringRequiredNonEmpty,
		'taskinput': mod_schema.sStringRequiredNonEmpty,
		'taskoutput': mod_schema.sStringRequiredNonEmpty
	    }
	},

	'tunables': {
	    'type': 'object',
	    'required': true,
	    'properties': {
		'httpMaxSockets': mod_schema.sNonNegativeInteger,
		'maxPendingOutputsPerTask': mod_schema.sIntervalRequired,
		'maxPendingPuts': mod_schema.sIntervalRequired,
		'timeHeartbeat': mod_schema.sIntervalRequired,
		'timeHogGrace': mod_schema.sIntervalRequired,
		'timeHogKill': mod_schema.sIntervalRequired,
		'timePoll': mod_schema.sIntervalRequired,
		'timeTasksCheckpoint': mod_schema.sIntervalRequired,
		'timeTick': mod_schema.sIntervalRequired,
		'timeZoneIdleMin': mod_schema.sIntervalRequired,
		'timeZoneIdleMax': mod_schema.sIntervalRequired,
		'zoneDisabledMaxPercent': mod_schema.sPercentRequired,
		'zoneDiskSlopPercent': mod_schema.sPercentRequired,
		'zoneLivenessCheck': mod_schema.sNonNegativeIntegerRequired,
		'zoneMemorySlopPercent': mod_schema.sPercentRequired,
		'zoneReserveMin': mod_schema.sIntervalRequired,
		'zoneReservePercent': mod_schema.sPercentRequired
	    }
	},

	'zoneDefaultImage': mod_schema.sStringRequiredNonEmpty,

	'zoneDefaults': {
	    'type': 'object',
	    'required': true
	}
    }
};
