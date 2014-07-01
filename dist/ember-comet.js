// >><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><< //
// ember-comet
// Author: Aaron Ghent
// >><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><<>><< //

var EmberComet = Ember.Object.extend({
	
	NAMESPACE: 'channels',

	url: null,
	logLevel: 'info', // "warn", "info", "debug"
	controllers: [],
	routes: [],
	connected: false,

	_comet: null,
	_handshakeSubscription: null,
	_subscriptions: [],

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

		var handshakeSubscription = comet.addListener('/meta/handshake', self, self._handshake, self);
		self.set('_handshakeSubscription', handshakeSubscription);

		// connect to server
		comet.handshake();

		self.set('_comet', comet);
	},

	subscribe: function(channel, callback, scope) {
		Ember.Logger.debug('[EmberComet] subscribe:', channel);
		var comet = this.get('_comet');

		var subscription = Ember.Object.create({
			channel: channel,
			callback: callback,
			scope: scope,
			handle: null
		});

		// see if subscription already exists
		var exists = this.get('_subscriptions').find(function(item) {
			if ((item.get('channel') == channel) && (item.get('callback') == callback) && (item.get('scope') == scope)) {
				return true;
			}
			return false;
		});

		if (this.get('connected')) {
			var cometSubscription = null;
			if (exists && exists.get('handle')) {
				cometSubscription = comet.resubscribe(exists.get('handle'));
			} else {
				cometSubscription = comet.subscribe('/%@'.fmt(channel), scope, callback);
			}
			subscription.set('handle', cometSubscription);
		}

		if(exists) {
			this.get('_subscriptions').removeObject(exists);
		}
		this.get('_subscriptions').pushObject(subscription);

		return subscription;
	},

	unsubscribe: function(subscription) {
		Ember.Logger.debug('[EmberComet] unsubscribe:', subscription);
		var comet = this.get('comet');
		comet.unsubscribe(subscription.get('handle'));
	},

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

	_handshake: function(reply) {
		var comet = this.get('_comet');
		var controllers = this.get('controllers');
		var routes = this.get('routes');
		var self = this;

		if (controllers == 'all') {
			Ember.Logger.debug('[EmberComet] Controller whitelist empty adding all controllers');
		}

		if (routes == 'all') {
			Ember.Logger.debug('[EmberComet] Controller whitelist empty adding all controllers');
		}

		if(reply.successful) {
			Ember.Logger.debug('[EmberComet] handshake successful:', reply);
			self.set('connected', true);

			Ember.run(self, function() {

				// connect all subscribed channels
				comet.batch(function() {
					self.get('_subscriptions').forEach(function(subscription) {
						self.subscribe(subscription.get('channel'), subscription.get('callback'), subscription.get('scope'));
					});

					if (Ember.isArray(controllers)) {
						controllers.forEach(function(controllerName) {
							var controller = self._getObjectFromContainer('controller:' + controllerName);
							if (controller) {
								self._subscribeChannels(controller);
							}
						}, self);
					}

				});
			}, self);

		} else {
			Ember.Logger.warn('[EmberComet] handshake unsuccessful:', reply);
			self.set('connected', false);
		}
	},

	_getObjectFromContainer: function(name) {
		var obj = this.container.lookup(name);
		if (!obj || (this.NAMESPACE in obj === false)) {
			 return null;
		}
		return obj;
	},

	_subscribeChannels: function (obj) {
		var channels = [];

		for (var channel in obj[this.NAMESPACE]) {
			if (obj[this.NAMESPACE].hasOwnProperty(channel)) {
				if (channels.indexOf(channel) !== -1) {
					continue;
				}
				channels.push(channel);

				var value = obj[this.NAMESPACE][channel];
				if (value instanceof Array) {
					for (var item in value) {
						if (value.hasOwnProperty(item)) {
							this._subscribeChannel(obj, channel, value[item]);
						}
					}
				} else {
					this._subscribeChannel(obj, channel, value);
				}
			}
		}

		return channels;
	},

	_subscribeChannel: function(controller, channel, value) {
		if (typeof value === 'function') {
			this.subscribe(channel, value, controller);
		} else {
			this.subscribe(channel, controller[value], controller);
		}
	},

	willDestroy: function() {
		Ember.Logger.log('[Comet] destroying');
		var comet = this.get('_comet');
		var transport = comet.getTransport();

		var handshakeSubscription = this.get('_handshakeSubscription');
		if (handshakeSubscription) {
			comet.removeListener(handshakeSubscription);
		}

		var subscriptions = this.get('_subscriptions');
		subscriptions.forEach(function (item) {
			comet.unsubscribe(item);
		});

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
