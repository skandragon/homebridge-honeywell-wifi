var http = require('http');
var Accessory, Service, Characteristic, UUIDGen;

var Utils = require('./lib/utils.js').Utils;

var platform_name = "honeywell-wifi";
var plugin_name = "homebridge-" + platform_name;
var storagePath;

module.exports = function(homebridge) {
  console.log("homebridge API version: " + homebridge.version);

  Accessory = homebridge.platformAccessory;
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  storagePath = homebridge.user.storagePath();

  homebridge.registerPlatform(plugin_name, platform_name, HoneywellWifi, true);
};

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function HoneywellWifi(log, config, api) {
  log("HoneywellWifi Init");
  var platform = this;
  this.log = log;
  this.config = config;
  this.accessories = [];
  this.hap_accessories = {};

  this.log("storagePath = %s", storagePath);
  this.log("config = %s", JSON.stringify(config));

  if (typeof(config) !== "undefined" && config !== null) {
    this.url = config.url;
  } else {
    this.log.error("config undefined or null!");
    this.log("storagePath = %s", storagePath);
    process.exit(1);
  }

  var plugin_version = Utils.readPluginVersion();
  this.log("%s v%s", plugin_name, plugin_version);

  this.requestServer = http.createServer(function(request, response) {
    if (request.url == "/add") {
      this.addAccessory(new Date().toISOString());
      response.writeHead(204);
      response.end();
    }

    if (request.url == "/reachability") {
      this.updateAccessoriesReachability();
      response.writeHead(204);
      response.end();
    }

    if (request.url == "/remove") {
      this.removeAccessory();
      response.writeHead(204);
      response.end();
    }
  }.bind(this));

  this.requestServer.listen(18081, function() {
    platform.log("Server Listening...");
  });

  if (api) {
      // Save the API object as plugin needs to register new accessory via this object.
      this.api = api;

      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories
      this.api.on('didFinishLaunching', function() {
        platform.log("DidFinishLaunching");
      }.bind(this));
  }
}

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
HoneywellWifi.prototype.configureAccessory = function(accessory) {
  this.log(accessory.displayName, "Configure Accessory");
  var platform = this;

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;

  accessory.on('identify', function(paired, callback) {
    platform.log(accessory.displayName, "Identify!!!");
    callback();
  });

  service = accessory.getService(Service.Thermostat);
  if (service) {
    service.getCharacteristic(Characteristic.TargetTemperature).on('set', function(value, callback) {
      platform.log(accessory.displayName, "TargetTemperature -> " + value);
      callback();
    });
  }

  this.accessories.push(accessory);
};

//Handler will be invoked when user try to config your plugin
//Callback can be cached and invoke when nessary
HoneywellWifi.prototype.configurationRequestHandler = function(context, request, callback) {
  this.log("Context: ", JSON.stringify(context));
  this.log("Request: ", JSON.stringify(request));

  // Check the request response
  if (request && request.response && request.response.inputs && request.response.inputs.name) {
    this.addAccessory(request.response.inputs.name);

    // Invoke callback with config will let homebridge save the new config into config.json
    // Callback = function(response, type, replace, config)
    // set "type" to platform if the plugin is trying to modify platforms section
    // set "replace" to true will let homebridge replace existing config in config.json
    // "config" is the data platform trying to save
    callback(null, "platform", true, {"platform":platform_name, "otherConfig":"SomeData"});
    return;
  }

  // - UI Type: Input
  // Can be used to request input from user
  // User response can be retrieved from request.response.inputs next time
  // when configurationRequestHandler being invoked

  var respDict = {
    "type": "Interface",
    "interface": "input",
    "title": "Add Accessory",
    "items": [
      {
        "id": "name",
        "title": "Name",
        "placeholder": "Fancy Light"
      }//,
      // {
      //   "id": "pw",
      //   "title": "Password",
      //   "secure": true
      // }
    ]
  };

  // - UI Type: List
  // Can be used to ask user to select something from the list
  // User response can be retrieved from request.response.selections next time
  // when configurationRequestHandler being invoked

  // var respDict = {
  //   "type": "Interface",
  //   "interface": "list",
  //   "title": "Select Something",
  //   "allowMultipleSelection": true,
  //   "items": [
  //     "A","B","C"
  //   ]
  // }

  // - UI Type: Instruction
  // Can be used to ask user to do something (other than text input)
  // Hero image is base64 encoded image data. Not really sure the maximum length HomeKit allows.

  // var respDict = {
  //   "type": "Interface",
  //   "interface": "instruction",
  //   "title": "Almost There",
  //   "detail": "Please press the button on the bridge to finish the setup.",
  //   "heroImage": "base64 image data",
  //   "showActivityIndicator": true,
  // "showNextButton": true,
  // "buttonText": "Login in browser",
  // "actionURL": "https://google.com"
  // }

  // Plugin can set context to allow it track setup process
  context.ts = "Hello";

  //invoke callback to update setup UI
  callback(respDict);
};

// Sample function to show how developer can add accessory dynamically from outside event
HoneywellWifi.prototype.addAccessory = function(accessoryName) {
  this.log("Add Accessory");
  var platform = this;
  var uuid = UUIDGen.generate(accessoryName);

  var newAccessory = new Accessory(accessoryName, uuid);
  newAccessory.on('identify', function(paired, callback) {
    platform.log(newAccessory.displayName, "Identify!!!");
    callback();
  });

  // Plugin can save context on accessory
  // To help restore accessory in configureAccessory()
  // newAccessory.context.something = "Something"

  var service = newAccessory.addService(Service.Thermostat, "Test Thermo");

  service.setCharacteristic(Characteristic.CurrentHeatingCoolingState,
      Characteristic.CurrentHeatingCoolingState.COOL);

  service.setCharacteristic(Characteristic.TargetHeatingCoolingState,
      Characteristic.TargetHeatingCoolingState.COOL);

  service.setCharacteristic(Characteristic.CurrentTemperature,
      23);

  service.setCharacteristic(Characteristic.TargetTemperature,
      22);

  service.setCharacteristic(Characteristic.CurrentHeatingCoolingState,
      Characteristic.CurrentHeatingCoolingState.COOL);

  service.setCharacteristic(Characteristic.TemperatureDisplayUnits,
      Characteristic.TemperatureDisplayUnits.FAHRENHEIT);

  service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
      .on('set', function(value, callback) {
        platform.log(newAccessory.displayName, "CurrentHeatingCoolingState -> " + value);
        callback();
      });

  service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .on('set', function(value, callback) {
        platform.log(newAccessory.displayName, "TargetHeatingCoolingState) -> " + value);
        callback();
      });

  service.getCharacteristic(Characteristic.CurrentTemperature)
      .on('set', function(value, callback) {
        platform.log(newAccessory.displayName, "CurrentTemperature -> " + value);
        callback();
      });

  service.getCharacteristic(Characteristic.TargetTemperature)
      .on('set', function(value, callback) {
        platform.log(newAccessory.displayName, "TargetTemperature -> " + value);
        callback();
      });

  service.getCharacteristic(Characteristic.TemperatureDisplayUnits)
      .on('set', function(value, callback) {
        platform.log(newAccessory.displayName, "TemperatureDisplayUnits -> " + value);
        callback();
      });

  this.accessories.push(newAccessory);
  this.api.registerPlatformAccessories(plugin_name, platform_name, [newAccessory]);
};

HoneywellWifi.prototype.updateAccessoriesReachability = function() {
  this.log("Update Reachability");
  for (var index in this.accessories) {
    var accessory = this.accessories[index];
    accessory.updateReachability(false);
  }
};

// Sample function to show how developer can remove accessory dynamically from outside event
HoneywellWifi.prototype.removeAccessory = function() {
  this.log("Remove Accessory");
  this.api.unregisterPlatformAccessories(plugin_name, platform_name, this.accessories);

  this.accessories = [];
};
