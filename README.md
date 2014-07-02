ember-comet
============

Ember Comet lets you easily intergrate with cometd services over the bayeux protocol

_____________________
### Getting Started

Install ember-comet via bower or [download ember-comet]

```sh
bower install ember-comet
```

Include the scripts you need (compiling all the cometd-jquery scripts included into one script is recommended)
Example Below

```html
<script src="/bower_components/jquery/dist/jquery.js"></script>
<script src="/bower_components/handlebars/handlebars.js"></script>
<script src="/bower_components/ember/ember.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/cometd-namespace.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/cometd-json.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/Utils.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/TransportRegistry.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/Transport.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/RequestTransport.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/LongPollingTransport.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/CallbackPollingTransport.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/WebSocketTransport.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/js/org/cometd/CometD.js"></script>
<script src="/bower_components/cometd-jquery/cometd-javascript/common/src/main/webapp/jquery/jquery.cometd.js"></script>

<script src="/bower_components/ember-comet/dist/ember-comet.js"></script>

```
First of all you need to bootstrap the module, which is done very much the same way that Ember.DS and Ember.Router go about it.

In your Ember.Application you need to configure EmberComet by defining the url and the controllers and routes (not defined in the example) capable of responding to Comet channels.

```js
App = Ember.Application.create({

    EmberComet: EmberComet.extend({
        url: 'http://localhost:4242/cometd/cometd/',
		logLevel: 'info',
        controllers: ['cats', 'dogs', 'rabbits']
    })

});
```

In the above configuration, we'll be attempting to connect to a local server. Only three controllers will be able to respond to Comet channels: CatsController, DogsController, and the RabbitsController.

To begin responding to events, you need to create a map of channels to their properties. When the channel is invoked the function will be sent the response.

Since the release of Ember 1.0, you have been encouraged to place your actions into the actions hash on each controller – EmberComet works in a similar way by defining the channels hash.

```js
App.CatsController = Ember.Controller.extend({
	
	channels: {
		meow: function(data) {
			console.log('meow:', data);
		},
		eat: 'eatsSome',
		thirdChannelName: [
			'eatsSome', 
			function(data) {
				console.log('thirdChannel:', data);
			}
		]
	},

	eatsSome: function(data) {
		console.log('eatsSome:', data);
	},

	alsoYouCanDoThis: function() {
		var subscription = this.comet.subscribe('meow', eatsSome);
		this.comet.publish('meow', { yawn: 'epic yawn' });
		this.comet.publish('eat', 'caeks');
		// this.comet.unsubscribe(subscription);
	}

});
```

### Documentation

To generate documention, first you need to initialize the git submodules

```sh
git submodule update --init --recursive
sudo npm install -g yuidocjs
yuidoc
```

#### TODO

- Unit tests
- Cometd server example setup

[download ember-comet]:https://github.com/AaronGhent/ember-comet/raw/master/dist/ember-comet.js
