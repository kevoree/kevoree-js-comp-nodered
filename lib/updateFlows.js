var when = require('when');

var K_INPUT = 'kWSServerInput';
var K_INPUT_CONF = 'kWSServerInputConf';
var K_OUTPUT = 'kWSServerOutput';
var K_OUTPUT_CONF = 'kWSServerOutputConf';

/**
 *
 * @param RED
 * @param flows
 * @param inPort
 * @param outPort
 * @returns {Promise<boolean>}
 */
module.exports = function (RED, flows, inPort, outPort) {
    var tabs        = [],
        kInput      = false,
        kInputConf  = null,
        kOutput     = false,
        kOutputConf = null,
        edited      = false;

    for (var i=0; i < flows.length; i++) {
        if (flows[i].type === 'tab') {
            tabs.push(flows[i].id);

        } else if (flows[i].id === K_INPUT) {
            kInput = true;

        } else if (flows[i].id === K_INPUT_CONF) {
            kInputConf = flows[i];

        } else if (flows[i].id === K_OUTPUT) {
            kOutput = true;

        } else if (flows[i].id === K_OUTPUT_CONF) {
            kOutputConf = flows[i];
        }

    }

    if (!kInput) {
        // no Kevoree Input Server found in flow => add it
        flows.push({
            id:     K_INPUT,
            name:   'kevoreeInput',
            type:   'websocket in',
            server: '',
            client: K_INPUT_CONF,
            x:      100,
            y:      100,
            z:      tabs[0], // TODO fix this because currently it is only added on first tab
            wires:  [[]]
        });
        edited = true;
    }

    if (!kInputConf) {
        // no Kevoree Input Server configuration found in flow => add it
        flows.push({
            id:       K_INPUT_CONF,
            type:     'websocket-client',
            path:     'ws://127.0.0.1:'+inPort,
            wholemsg: 'false'
        });
        edited = true;
    } else {
        if (kInputConf.path !== 'ws://127.0.0.1:'+inPort) {
            kInputConf.path = 'ws://127.0.0.1:'+inPort;
            edited = true;
        }
    }

    if (!kOutput) {
        // no Kevoree Output Server found in flow => add it
        flows.push({
            id:     K_OUTPUT,
            name:   'kevoreeOutput',
            type:   'websocket out',
            server: '',
            client: K_OUTPUT_CONF,
            x:      300,
            y:      100,
            z:      tabs[0], // TODO fix this because currently it is only added on first tab
            wires:  [[]]
        });
        edited = true;
    }

    if (!kOutputConf) {
        // no Kevoree Output Server configuration found in flow => add it
        flows.push({
            id:       K_OUTPUT_CONF,
            type:     'websocket-client',
            path:     'ws://127.0.0.1:'+outPort,
            wholemsg: 'false'
        });
        edited = true;
    } else {
        if (kOutputConf.path !== 'ws://127.0.0.1:'+outPort) {
            kOutputConf.path = 'ws://127.0.0.1:'+outPort;
            edited = true;
        }
    }

    if (edited) {
        return RED.nodes.setFlows(flows)
            .then(function () {
                return edited;
            });
    } else {
        return when.resolve(edited);
    }
};