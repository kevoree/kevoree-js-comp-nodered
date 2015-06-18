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

    construct: function () {
        this.server = null;
        this.clients = {};
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

        // Serve the editor UI from /red
        app.use(settings.httpAdminRoot, RED.httpAdmin);

        // Serve the http nodes UI from /api
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

            // Start the runtime
            RED.start().then(function () {
                done();
            });
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
        this.stop(function () {
            this.start(done);
        }.bind(this));
    }
});

module.exports = NodeRED;
