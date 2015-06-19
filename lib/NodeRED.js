var AbstractComponent = require('kevoree-entities').AbstractComponent;
var http = require('http');
var express = require("express");
var RED = require("node-red");
var shortid = require('shortid');

/**
 * Kevoree component
 * @type {NodeRED}
 */
var NodeRED = AbstractComponent.extend({
    toString: 'NodeRED',

    dic_port: { optional: false, defaultValue: 9090 },
    dic_userDir: { optional: false },
    dic_httpAdminRoot: { optional: false, defaultValue: '/' },
    dic_httpNodeRoot: { optional: false, defaultValue: '/red' },
    dic_flows: { },

    construct: function () {
        this.server = null;
        this.clients = {};
        this.needRestart = false;
    },

    /**
     * this method will be called by the Kevoree platform when your component has to start
     * @param {Function} done
     */
    start: function (done) {
        // Create an Express app
        var app = express();

        // Add a simple route for static content served from 'public'
        app.use("/", express.static("public"));

        // Create a server
        this.server = http.createServer(app);

        var userDir = this.getDictionary().getString('userDir'),
            httpAdminRoot = this.getDictionary().getString('httpAdminRoot'),
            httpNodeRoot = this.getDictionary().getString('httpNodeRoot');

        if (!userDir || userDir.length === 0) {
            done(new Error('"'+this.getName()+'" attribute "userDir" must be set'));
            return;
        }

        // Create the settings object - see default settings.js file for other options
        var settings = {
            httpAdminRoot:         httpAdminRoot,
            httpNodeRoot:          httpNodeRoot,
            userDir:               userDir,
            functionGlobalContext: { }    // enables global context
        };

        // Initialise the runtime with a server and settings
        RED.init(this.server, settings);

        // Serve the editor UI from settings.httpAdminRoot
        app.use(settings.httpAdminRoot, RED.httpAdmin);

        // Serve the http nodes UI from settings.httpNodeRoot
        app.use(settings.httpNodeRoot, RED.httpNode);

        var port = this.getDictionary().getNumber('port', this.dic_port.defaultValue);
        if (!port) {
            done(new Error('"'+this.getName()+'" attribute "port" must be set'));
            return;
        }

        this.server.on('connection', function (client) {
            var id = shortid.generate();
            this.clients[id] = client;

            client.on('close', function () {
                delete this.clients[id];
            }.bind(this));
        }.bind(this));

        this.server.listen(port, function () {
            this.log.info(this.toString(), '"'+this.getName()+'" server started at http://0.0.0.0:'+port+httpAdminRoot);

            // Use given flows as default flows (if any)
            var flows = this.getDictionary().getString('flows', "");

            // Start the runtime
            RED.start()
                .then(function () {
                    if (flows && flows.length > 0) {
                        try {
                            flows = JSON.parse(flows);
                        } catch (err) {
                            done(new Error('"'+this.getName()+'" attribute "flows" is an invalid JSON'));
                            return;
                        }
                        RED.nodes.setFlows(flows)
                            .then(function () {
                                this.log.info(this.toString(), '"'+this.getName()+'" flows deployed successfully');
                            }.bind(this))
                            .catch(function (err) {
                                this.log.warn(this.toString(), '"'+this.getName()+'" unable to deploy flows ('+err.message+')');
                            }.bind(this))
                            .finally(function () {
                                done();
                            });
                    } else {
                        done();
                    }
                }.bind(this))
                .catch(function (err) {
                    done(err);
                }.bind(this));
        }.bind(this));

        // do not rebind handlers when component is restarting
        this.getDictionary().emitter
            .removeAllListeners('port')
            .removeAllListeners('httpAdminRoot')
            .removeAllListeners('httpNodeRoot')
            .removeAllListeners('userDir')
            .removeAllListeners('flows');

        this.getDictionary().on('flows', function (flows) {
            if (flows && flows.length > 0) {
                try {
                    flows = JSON.parse(flows);
                } catch (err) {
                    this.log.error(this.toString(), '"'+this.getName()+'" attribute "flows" is an invalid JSON');
                    return;
                }

                RED.nodes.setFlows(flows)
                    .then(function () {
                        this.log.info(this.toString(), '"'+this.getName()+'" flows deployed successfully');
                    }.bind(this))
                    .catch(function (err) {
                        this.log.warn(this.toString(), '"'+this.getName()+'" unable to deploy flows ('+err.message+')');
                    }.bind(this));
            }
        }.bind(this));
        this.getDictionary().on('port', function () {
            console.log('update port');
            this.needRestart = true;
        }.bind(this));
        this.getDictionary().on('httpAdminRoot', function () {
            console.log('update httpAdminPort');
            this.needRestart = true;
        }.bind(this));
        this.getDictionary().on('httpNodeRoot', function () {
            console.log('update httpNodePort');
            this.needRestart = true;
        }.bind(this));
        this.getDictionary().on('userDir', function () {
            console.log('update userDir');
            this.needRestart = true;
        }.bind(this));
    },

    /**
     * this method will be called by the Kevoree platform when your component has to stop
     * @param {Function} done
     */
    stop: function (done) {
        RED.stop();
        if (this.server) {
            for (var id in this.clients) {
                if (this.clients.hasOwnProperty(id)) {
                    this.clients[id].destroy();
                    delete this.clients[id];
                }
            }
            this.server.close(function () {
                done();
            }.bind(this));
        } else {
            done();
        }
    },

    update: function (done) {
        if (this.needRestart) {
            this.stop(function () {
                this.start(done);
            }.bind(this));
        }
        this.needRestart = false;
        done();
    },

    in_input: function (data) {
        var flows;
        try { flows = RED.nodes.getFlows(); } catch (err) {
            this.log.error(this.toString(), '"'+this.getName()+'" unable to get flows ('+err.message+'). Incoming message will not be sent to NodeRED');
            return;
        }

        var tabId = null,
            kevoreeInputServer = null,
            kevoreeInputServerClient = null,
            input = null,
            output = null;
        for (var i=0; i<flows.length; i++) {
            var item = flows[i];

            if (item.type === 'tab' && !tabId) {
                // only works with first tab
                tabId = item.id;
            }

            if (item.id === 'kevoreeInputServer') {
                kevoreeInputServer = item;
            }

            if (item.id === 'kevoreeInputServerClient') {
                kevoreeInputServerClient = item;
            }

            if (item.name === 'kevoreeInput') {
                input = item;
            }

            if (item.name === 'kevoreeOutput') {
                output = item;
            }
        }

        if (!kevoreeInputServer) {
            kevoreeInputServer = {
                id:     'kevoreeInputServer',
                name:   'kevoreeInputServer',
                type:   'websocket in',
                server: '',
                client: 'kevoreeInputServerClient',
                x:      100,
                y:      100,
                z:      tabId,
                wires:  [[]]
            };
            flows.push(kevoreeInputServer);
        }

        if (!kevoreeInputServerClient) {
            kevoreeInputServerClient = {
                id:       'kevoreeInputServerClient',
                type:     'websocket-client',
                path:     'ws://127.0.0.1:9091',
                wholemsg: 'false'
            };
            flows.push(kevoreeInputServerClient);
        }

        if (input) {
            kevoreeInputServer.wires = kevoreeInputServer.wires || [[]];
            kevoreeInputServer.wires[0].push(input.id);
        }

        RED.nodes.setFlows(flows)
            .then(function () {
                this.log.info(this.toString(), '"'+this.getName()+'" updated flows. Incoming message sent to NodeRED');
            }.bind(this))
            .catch(function (err) {
                this.log.error(this.toString(), '"'+this.getName()+'" unable to set flows ('+err.message+'). Incoming message will not be sent to NodeRED');
            }.bind(this));

        // check flow if kevoreeInput & input are here
        // - if not: create them & deploy flow
        // - else deploy flow
    },

    out_output: function (data) {

    }
});

module.exports = NodeRED;
