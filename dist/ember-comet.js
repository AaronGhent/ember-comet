// >><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><< //
// ember-comet
// Author: Aaron Ghent
// >><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><< //

/**
* EmberComet lets you easily intergrate ember with cometd services over the bayeux protocol
*
* @class EmberComet
* @main EmberComet
* @constructor
*/
var EmberComet = Ember.Object.extend({

	/**
	* Default namespace for the hash that accepts channels
	*
	* @attribute NAMESPACE
	* @type String
	* @writeOnce
	* @optional
	* @default "channels"
	*/
	NAMESPACE: 'channels',

	/**
	* Default config variable url to connect to eg, http://localhost:4242/cometd/cometd/
	*
	* @attribute url
	* @writeOnce
	* @required
	* @type String
	*/
	url: null,

	/**
	* verbosity of the logging there are three values that are passed onto comet
	* "warn", "info", "debug"
	*
	* @attribute logLevel
	* @type String
	* @writeOnce
	* @optional
	* @default "channels"
	*/
	logLevel: 'warn',

	/**
	* a array of controllers in camelized form, to read the NAMESPACE hash on to connect to channels
	*
	* @attribute controllers
	* @type Array
	* @writeOnce
	* @optional
	* @default "[]"
	*/
	controllers: [],

	/**
	* a array of routes in camelized form, to read the NAMESPACE hash on to connect to channels
	*
	* @attribute routes
	* @type Array
	* @writeOnce
	* @optional
	* @default "[]"
	*/
	routes: [],

	/**
	* indicates connection status to the cometd server
	*
	* @attribute connected
	* @type boolean
	* @readOnly
	* @default "false"
	*/
	connected: false,

	/**
	* holds a handle to the comet object being used for transmission of infomation
	*
	* @property _comet
	* @type Object
	* @private
	* @readOnly
	*/
	_comet: null,

	/**
	* holds a handle to the handshake listener
	*
	* @property _handshakeListenerHandle
	* @type Object
	* @private
	* @readOnly
	*/
	_handshakeListenerHandle: null,

	/**
	* holds a handle to the connect listener
	*
	* @property _connectListenerHandle
	* @type Object
	* @private
	* @readOnly
	*/
	_connectListenerHandle: null,

	/**
	* holds a handle to the disconnect listener
	*
	* @property _disconnectListenerHandle
	* @type Object
	* @private
	* @readOnly
	*/
	_disconnectListenerHandle: null,

	/**
	* holds an array of handles to subscriptions
	*
	* @property _subscriptions
	* @type Object
	* @private
	* @readOnly
	*/
	_subscriptions: [],

	/**
	* @method init
	* @protected
	*/
	init: function() {
		if (!this.get('url')) {
			throw '[EmberComet] No url supplied to Comet from the Ember.Application';
		}

		Ember.Logger.debug('[EmberComet] init: url(%@) logLevel(%@)'.fmt(this.get('url'), this.get('logLevel')));
		var comet = $.cometd;
		var self = this;

		comet.configure({
			url: self.get('url'),
			logLevel: self.get('logLevel')
		});

		comet.onListenerException = function(exception, subscriptionHandle, isListener, message) {
			Ember.Logger.warn('[EmberComet] Exception:', exception, message);
			if (isListener) {
				self.removeListener(subscriptionHandle);
			} else {
				self.unsubscribe(subscriptionHandle);
			}
		};

		var handshakeListenerHandle = comet.addListener('/meta/handshake', self, self._handshake, self);
		self.set('_handshakeListenerHandle', handshakeListenerHandle);

		var connectListenerHandle = comet.addListener('/meta/connect', self, self._connect, self);
		self.set('_connectListenerHandle', connectListenerHandle);

		var disconnectListenerHandle = comet.addListener('/meta/disconnect', self, self._disconnect, self);
		self.set('_disconnectListenerHandle', disconnectListenerHandle);

		// connect to server
		comet.handshake();

		self.set('_comet', comet);
	},

	/**
	* Subscribe to a channel
	*
	* @method subscribe
	* @param {String} channel The channel your subscribing too.
	* @param {Function} callback The callback you want to recieve all messages on the channel from
	* @param {Object} [scope] The scope of the callback function (defaults to the caller)
	* @return {Object} subscription details
	*/
	subscribe: function(channel, callback, scope) {
		Ember.Logger.debug('[EmberComet] subscribe:', channel);
		var comet = this.get('_comet');

		// see if subscription already exists
		var subscription = this.get('_subscriptions').find(function(item, index) {
			if ((item.get('channel') === channel) && (item.get('callback') === callback) && (item.get('scope') === scope)) {
				return true;
			}
			return false;
		});

		// if subscription doesnt exist create it
		if (!subscription) {
			subscription = Ember.Object.create({
				channel: channel,
				callback: callback,
				scope: scope,
				handle: null
			});
			this.get('_subscriptions').pushObject(subscription);
		}

		if (this.get('connected')) {
			var cometSubscription = null;
			if (subscription && subscription.get('handle')) {
				cometSubscription = comet.resubscribe(subscription.get('handle'));
			} else {
				cometSubscription = comet.subscribe('/%@'.fmt(channel), scope, callback);
			}
			subscription.set('handle', cometSubscription);
		}

		return subscription;
	},

	/**
	* Unsubscribe from a channel
	*
	* @method unsubscribe
	* @param {Object} subscription The subscription object returned from the subscribe call
	*/
	unsubscribe: function(subscription) {
		Ember.Logger.debug('[EmberComet] unsubscribe:', subscription);
		var comet = this.get('_comet');
		comet.unsubscribe(subscription.get('handle'));
	},

	/**
	* Publishes to a channel
	*
	* @method publish
	* @param {String} channel The channel you want to publish a message to
	* @param message This can be a type of any kind as long as its considered json
	*/
	publish: function(channel, message) {
		Ember.Logger.debug('[EmberComet] publish to %@:'.fmt(channel), message);
		var comet = this.get('_comet');
		return new Promise(function(resolve, reject) {
			comet.publish('/%@'.fmt(channel), message, function(reply) {
				if (reply.successful) {
					Ember.Logger.debug('[EmberComet] message published to %@ successfully:'.fmt(channel), message);
					resolve(reply);
				} else {
					Ember.Logger.debug('[EmberComet] message published to %@ unsuccessfully:'.fmt(channel), message);
					reject(reply);
				}
			});
		});
	},

	/**
	* Connect callback for comet called when a connect is detected
	*
	* @method _connect
	* @private
	*/
	_connect: function(message) {
		Ember.Logger.debug('[EmberComet] connected:', message);
		this.set('connected', true);
	},

	/**
	* Disconnect callback for comet called when a disconnect is detected
	*
	* @method _disconnect
	* @private
	*/
	_disconnect: function(message) {
		Ember.Logger.debug('[EmberComet] disconnected:', message);
		this.set('connected', false);
	},

	/**
	* This is a callback from the handshake function from jquery cometd
	*
	* @method _handshake
	* @private
	* @param {Object} reply
	*/
	_handshake: function(reply) {
		var controllers = this.get('controllers');
		var routes = this.get('routes');
		var comet = this.get('_comet');
		var self = this;

		if (reply.successful) {
			Ember.Logger.debug('[EmberComet] handshake successful:', reply);
			self.set('connected', true);

			Ember.run(self, function() {
				comet.batch(function() {
					if (Ember.isArray(controllers)) {
						controllers.forEach(function(controllerName) {
							self._subscribeObject(self._getObjectFromContainer('controller:' + controllerName));
						}, self);
					}

					if (Ember.isArray(routes)) {
						routes.forEach(function(routeName) {
							self._subscribeObject(self._getObjectFromContainer('route:' + routeName));
						}, self);
					}

					self.get('_subscriptions').forEach(function(subscription) {
						self.subscribe(subscription.get('channel'), subscription.get('callback'), subscription.get('scope'));
					});

				});
			}, self);

		} else {
			Ember.Logger.warn('[EmberComet] handshake unsuccessful:', reply);
			self.set('connected', false);
		}
	},

	/**
	* Retrieves an object from embers interal container
	*
	* @method _getObjectFromContainer
	* @private
	* @param {String} name The ember internal name to lookup via the container, using the type:classifyed name
	*/
	_getObjectFromContainer: function(name) {
		var obj = this.container.lookup(name);
		if(!obj) {
			Ember.Logger.warn('[EmberComet] Cant find object for %@'.fmt(name));
			return null;
		}

		if (this.NAMESPACE in obj === false) {
			Ember.Logger.warn('[EmberComet] Cant find %@ in %@'.fmt(this.NAMESPACE, name));
			return null;
		}
		return obj;
	},

	/**
	 *	Subscribe and object (controller or route) to all the channels defined within itself
	 *
	 * @method _subscribeObject
	 * @private
	 * @param  {Object} obj
	 */
	_subscribeObject: function(obj) {
		if (!obj) {
			Ember.Logger.warn('[EmberComet] Cannot subscribe a null object');
			return;
		}

		var channels = this._getChannels(obj);
		channels.forEach(function(channel) {
			this.subscribe(channel.get('channel'), channel.get('callback'), channel.get('scope'));
		}, this);
	},

	/**
	* Looks up all the channels specified in an Object (controller/route) passed in and returns them in an array
	*
	* @method _subscribeChannels
	* @private
	* @param {Object} obj Takes a controller of route object
	*/
	_getChannels: function (obj) {
		var check = [];
		var channels = [];

		for (var channel in obj[this.NAMESPACE]) {
			if (obj[this.NAMESPACE].hasOwnProperty(channel)) {
				if (check.contains(channel)) {
					Ember.Logger.warn('[EmberComet] You have double ups defined in %@ of channel %@'.fmt(obj.toString(), channel));
					continue;
				}
				check.push(channel);
				var value = obj[this.NAMESPACE][channel];
				if (value instanceof Array) {
					var dblcheck = [];
					for (var item in value) {
						if (value.hasOwnProperty(item)) {
							if (dblcheck.contains(value[item])) {
								Ember.Logger.warn('[EmberComet] You have double ups defined in %@ on channel %@ pointing to the same function %@'.fmt(obj.toString(), channel, value[item]));
								continue;
							}
							dblcheck.push(value[item]);
							channels.pushObject(this._getChannel(obj, channel, value[item]));
						}
					}
				} else {
					channels.pushObject(this._getChannel(obj, channel, value));
				}
			}
		}

		return channels;
	},

	/**
	* Gets the to the channel with the callback to the controller
	* called from _getChannels
	*
	* @method _getChannel
	* @private
	* @param {Object} obj Takes a controller of route object
	* @param {String} channel Takes a channel name to subscribe to
	* @param value Takes a channel name to subscribe to
	*/
	_getChannel: function(obj, channel, value) {
		if (typeof value !== 'function') {
			value = obj[value];
		}

		return Ember.Object.create({
			channel: channel,
			callback: value,
			scope: obj
		});
	},

	/**
	* Object teardown
	*
	* @method willDestroy
	* @protected
	*/
	willDestroy: function() {
		Ember.Logger.log('[EmberComet] destroying');
		var comet = this.get('_comet');

		var handshakeListenerHandle = this.get('_handshakeListenerHandle');
		if (handshakeListenerHandle) {
			comet.removeListener(handshakeListenerHandle);
		}

		var connectListenerHandle = this.get('_connectListenerHandle');
		if (connectListenerHandle) {
			comet.removeListener(connectListenerHandle);
		}

		var disconnectListenerHandle = this.get('_disconnectListenerHandle');
		if (disconnectListenerHandle) {
			comet.removeListener(disconnectListenerHandle);
		}

		var subscriptions = this.get('_subscriptions');
		subscriptions.forEach(function (item) {
			comet.unsubscribe(item);
		});

		var transport = comet.getTransport();
		if (transport) {
			transport.abort();
		}

		comet.disconnect();
		Ember.Logger.log('[EmberComet] destroyed');
	}
});

Ember.Application.initializer({
	name: 'comet',
	initialize: function(container, application) {
		if (typeof application.EmberComet === 'undefined') {
			throw 'You have forgotten to add EmberComet into Ember.Application!';
		}
		container.register('comet:main', application.EmberComet, {singleton: true});
		application.inject('controller', 'comet', 'comet:main');
		application.inject('route', 'comet', 'comet:main');
	}
});

// >><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><< //
