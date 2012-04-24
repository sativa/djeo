define([
	"require",
	"dojo/_base/declare", // declare
	"dojo/_base/lang", // getObject, mixin, hitch, isString, isArray, isObject
	"dojo/has", // has
	"dojo/dom", // byId
	"dojo/_base/array", // forEach
	"dojo/dom-geometry", // getContentBox, position
	"dojo/_base/xhr", // get
	"dojo/_base/kernel", // global
	"dojo/aspect", // after
	"./_base",
	"./FeatureContainer",
	"./Placemark" // just request it, no actual use of djeo.Placemark
], function(require, declare, lang, has, dom, array, domGeom, xhr, kernel, aspect, djeo, FeatureContainer){

return declare(null, {
	// summary:
	//		The main map object. See djeo/tests and djeo-demos for examples

	// engine: djeo.Engine
	//		Engine used by the map
	//		Engine examples: djeo (djeo native engine), gmaps (Google Maps), ge (Google Earth)
	engine: null,
	
	// engineOptions: Object
	//		A registry of options for each possible engine, e.g
	//	|	{
	//	|		djeo: {option1: value1, option2: value2},
	//	|		gmaps: {option3: value3, option4: value4}
	//	|	}
	engineOptions: null,

	// extent: Array
	//		Active area of the map
	//		Its format: [smallest horizontal coordinate, smallest vertical coordinate,
	//		largest horizontal coordinate, largest vertical coordinate]
	extent: null,

    // features: Object
	//		A registry of features that can be referenced by id.
	features: null,

    // geometries: Object
	//		A registry of geometries that can be referenced by id.
	geometries: null,

	// document: djeo.FeatureContainer
	//		Top level djeo.FeatureContainer
	document: null,

	// layers: String | Array
	//		Specifies which additional information to display on the djeo map. Typical layers are
	//		sattelite imagery, road map, hybrid of sattelite imagery and road map.
	//		Google Earth engine supports multiple layers. The other engines support only one layer at time.
	//		The attribute is used only during map initialization. Use enableLayer member function
	//		to enable or disable a specific layer.
	layers: null,
	
	// useAttrs: Boolean
	//		Specifies whether feature attributes are defined directly in the feature
	//		or in the 'attrs' attribute of the feature.
	//		Example for useAttrs==true:
	//	|	var feature = {
	//	|		id: "someId",
	//	|		attrs: {
	//	|			attribute1: 1,
	//	|			attribute2: "someValue"
	//	|		}
	//	|	}
	//		Example for useAttrs==false:
	//	|	var feature = {
	//	|		id: "someId",
	//	|		attribute1: 1,
	//	|		attribute2: "someValue"
	//	|	}
	useAttrs: false,
	
	// renderModels: Boolean
	//		Specifies if an engine (e.g. ge - Google Earth) capable of rendering 3D models
	//		should really render them.
	//		If renderModels is set to false for such engine, it is supposed to render
	//		2D representation of the 3D model
	renderModels: true,
	
	// iconBasePath: String
	//		This path is prepended to the src field in each style definition
	//		provided that the src field specifies a relative path
	iconBasePath: '',
	// modelBasePath: String
	//		This path is prepended to the href field in each definition of djeo.Model
	//		provided that the href field specifies a relative path
	modelBasePath: '',
	
	// styleById: Object
	//		A registry of instances of djeo.Style. Instance id is used as a key
	styleById: null,
	// styleByFid: Object
	//		A registry of instances of djeo.Style with fid attribute (feature id)
	//		Fid (feature id) is used as a key
	styleByFid: null,
	// styleByFid: Object
	//		A registry of instances of djeo.Style with styleClass attribute
	//		styleClass is used as a key
	styleByClass: null,
	// styleByClassAndFid: Object
	//		A registry of instances of djeo.Style with both styleClass and fid attributes
	//		styleClass and fid are used as keys
	styleByClassAndFid: null,
	// featuresByClass: Object
	//		A registry of features (i.e. instances of djeo.Feature) with styleClass attribute
	//		styleClass is used as a key
	featuresByClass: null,

	// _ready: Boolean
	//		Used by the ready function.
	//		If set to true the callback supplied to the ready function is called immediately,
	//		otherwise _onEngineReady is being waited
	_ready: false,

	constructor: function(/* DOMNode */container, /* Object? */kwArgs){
		// summary:
		//		The constructor for a new Chart. Add map features if provided.
		// returns: djeo.Map
		//		The newly created map object.
		
		// initialize styling registries
		this.styleById = {};
		this.styleByFid = {};
		this.styleByClass = {};
		this.styleByClassAndFid = {};
		this.featuresByClass = {};

		this.engineOptions = {};

		if (has("host-browser")) {
			this.container = dom.byId(container);
		}

		if(!kwArgs) kwArgs = {};
		lang.mixin(this, kwArgs);

		// features
		this.features = {};
		// geometries
		this.geometries = {};
		// load geometries that can be referenced by features
		if (kwArgs.geometries) this.loadGeometries(kwArgs.geometries);
		// top level instance of djeo.FeatureContainer
		this.document = new FeatureContainer(null, {
			map: this,
			parent: this
		});
		// add default styling definition
		this.addStyle(djeo.defaultStyle, /*prevent rendering*/true);
		// add user supplied styling definition
		if (kwArgs.style) this.addStyle(kwArgs.style, /*prevent rendering*/true);
		// add features
		if (kwArgs.features) this.addFeatures(kwArgs.features, /*prevent rendering*/true);
		// set engine
		this.setEngine(
			kwArgs.engine ||
			(kernel.global.dojoConfig && kernel.global.dojoConfig.djeoEngine) ||
			require.rawConfig.djeoEngine ||
			djeo.defaultEngine
		);
	},
	
	ready: function(/* Function */callback) {
		// summary:
		//		Calls the supplied function when:
		//		1) the map engine is initialized;
		//		2) engine implementations for the application dependencies are loaded;
		//		3) features supplied to the constructor are rendered;
		if (this._ready) {
			callback();
		}
		else {
			aspect.after(this, "_afterOnEngineReady", callback);
		}
	},
	
	_onEngineReady: function() {
		// find which dependencies we need and require them
		var requireModules = [];
		// TODO: make optimization for the case of different engines on the same web page:
		// allow a user to specify module dependencies per each instance of djeo.Map
		for (var dep in djeo.dependencies) {
			var moduleId = this.engine.matchModuleId(dep);
			if (moduleId) {
				requireModules.push(moduleId);
			}
		}
		require(requireModules, lang.hitch(this, function() {
			// Ok, all preliminary work is finished
			// Now loads layer and perform rendering

			// load layers
			if (this.layers) {
				if (lang.isString(this.layers)) this.layers = [this.layers];
				if (this.layers.length) {
					array.forEach(this.layers, function(layerId){
						this.enableLayer(layerId, true);
					}, this);
				}
				else this.enableLayer(djeo.defaultLayerID);
			}
			else this.enableLayer(djeo.defaultLayerID);

			// perform rendering
			if (this.document.features.length) this.render();

			this._ready = true;
			this._afterOnEngineReady();
		}));
	},
	
	_afterOnEngineReady: function() {
		
	},
	
	addFeatures: function(/* Array|Object */features, /* Boolean? */preventRendering) {
		// summary:
		//		Adds features to the top level feature container of the map
		// preventRendering:
		//		If set to true prevents immediate rendering of the added features
		// returns: Array
		//		Array of added features or an empty array
		return this.document.addFeatures(features, preventRendering);
	},
	
	removeFeatures: function(/* Array|Object */features) {
		// summary:
		//		Removes features from the top level container of the map
		this.document.removeFeatures(features);
	},
	
	render: function(/* Boolean */stylingOnly, /* String? */theme) {
		// summary:
		//		Render map features
		// stylingOnly:
		//		If set to true, only style is reapplied to the features. This is used by the Highlight control
		// theme:
		//		Specifies which theme to use for map rendering.
		//		If theme is not set, the map will be rendered with the theme set for the "normal" map mode
		this.engine.render(stylingOnly, theme);
	},
	
	renderFeatures: function(/* Array|Object */features, /* Boolean */stylingOnly, /* String? */theme) {
		// summary:
		//		Renders the specified features instead of the whole map tree
		// features:
		//		Can be an array or a "hash" (javascript object) of features.
		//		Feature id is used as a hash key in the latter case.
		this.engine.renderFeatures(features, stylingOnly, theme);
	},
	
	show: function(/* Array|Object|String|Boolean */features, /* Boolean? */show) {
		if (features === undefined) {
			features = this.document;
		}
		if (show === undefined) {
			if (features === true || features === false) {
				show = features;
				features = this.document;
			}
			else {
				show = true;
			}
		}

		if (!lang.isArray(features)) features = [features];
		array.forEach(features, function(feature){
			if (lang.isString(feature)) feature = this.getFeatureById(feature);
			if (feature) feature.show(show);
		}, this);
	},
	
	_show: function(feature, show, attrOnly){
		
	},
	
	toggleVisibility: function(features) {
		if (!features) features = this.document;
		if (!lang.isArray(features)) features = [features];
		array.forEach(features, function(feature){
			if (lang.isString(feature)) feature = this.getFeatureById(feature);
			if (feature) feature.toggleVisibility();
		}, this);
	},

	resize: function() {
		// summary:
		//		Call it if the map container has been resized
		this._calculateViewport();
		//this.render();
	},

	enableLayer: function(/* String */layerId, /* Boolean? */enable) {
		// summary:
		//		Enables or disables an additional layer specified by its id.
		// description:
		//		Enables or disables an additional layer specified by its id.
		//		A layer specifies which additional information to display on the djeo map.
		//		Typical layers are sattelite imagery, road map, hybrid of sattelite imagery and road map.
		if (enable === undefined) enable = true;
		this.engine.enableLayer(layerId, enable);
	},
	
	getContainer: function() {
		return this.engine.getTopContainer();
	},

	_calculateViewport: function() {
		// summary:
		//		Calculates map's div parameters
		// tags:
		//		private
		var contentBox = domGeom.getContentBox(this.container);
		var coords = domGeom.position(this.container,true);
		this.width = this.width || contentBox.w || 100;
		this.height = this.height || contentBox.h || 100;
		this.x = coords.x;
		this.y = coords.y;
	},

	loadGeometries: function(/* String|Array|Object */geometries) {
		// summary:
		//		Loads geometries that can be referenced by features
		// geometries:
		//		1) If set to a string, it specifies a path for actual geometries
		//		2) If set to an object, it specifies a "hash" of geometries.
		//		   Geometry id is used as a hash key in this case.
		//		3) If set to an array, it specifies an array of geometries.
		//		   The array is transormed to the "hash" of geometries
		if (lang.isString(geometries)) {
			xhr.get({
				url: geometries,
				handleAs: "json",
				sync: true,
				load: lang.hitch(this, function(/* Array|Object */_geometries){
					this.loadGeometries(_geometries);
				})
			});
		}
		else if (lang.isArray(geometries)) {
			array.forEach(geometries, function(geometry){
				if (geometry.id) this.geometries[geometry.id] = geometry;
			}, this);
		}
		else { // Object
			this.geometries = geometries;
		}
	},
	
	addStyle: function(/* Array|Object */style, /* Boolean? */preventRendering) {
		// summary:
		//		Adds styling definition.
		// preventRendering:
		//		If set to true prevents immediate rendering
		this.document.addStyle(style, preventRendering);
	},

	getGeometryById: function(/* String */id) {
		// summary:
		//		Looks up a geometry by id from the registry of geometries
		// returns:
		//		Geometry object or undefined
		return this.geometries[id];
	},

	getStyleById: function(/* String */id) {
		// summary:
		//		Looks up a style by id from the registry of styles
		// returns:
		//		djeo.Style or undefined
		return this.styleById[id];
	},

	registerFeature: function(/* Object */feature) {
		// summary:
		//		Adds the feature to the registry of features
		// feature:
		//		Should be an instance of a class inherited from djeo.Feature
		if (feature.id) this.features[feature.id] = feature;
	},

	getFeatureById: function(id) {
		// summary:
		//		Looks up a map feature by id from the registry of features
		// returns:
		//		An instance of a class inherited from djeo.Feature or undefined
		return this.features[id];
	},

	on: function(/* String|Array? */events, /*Function*/ method, /*Object?*/ context) {
		// summary:
		//		Adds a listener for an event or an array of events for all features in the map
		// returns: Number
		//		A handle that identifies this particular connection
		return this.document.on(events, method, context);
	},

	onForHandle: function(/* String|Number */ handle, /* Object */kwArgs) {
		// summary:
		//		Adds a listener for an event or an array of events for all features in the map
		//		The connection will be associated with the supplied handle
		// returns: Number
		//		The supplied handle
		return this.document.onForHandle(handle, kwArgs);
	},
	
	disconnect: function(/* Number */handle, key, removeEventListener) {
		// summary:
		//		Removes all event listeners associated with the handle for all features in the map
		this.document.disconnect(handle, key, removeEventListener);
	},

	setEngine: function(/* String|Object */engine, /* Object? */engineOptions) {
		// summary:
		//		Sets an engine for the map. Engine examples: djeo (djeo native engine), gmaps (Google Maps), ge (Google Earth)

		if (lang.isString(engine)) {
			// TODO check in the engine cache if engine instance has been created before
			var config = require.rawConfig,
				packageDefined = false;
			// check if name is a package id or defined in the paths attribute of the dojo config
			if (config.paths && config.paths[engine]) {
				packageDefined = true;
			}
			else if (config.packages) {
				var packs = config.packages;
				for(var i=0; i<packs.length; i++) {
					if (packs[i].name == engine) {
						packageDefined = true;
						break;
					}
				}
			}
			var engineMid = (engine == "djeo") ?
				"./djeo/Engine" :
				(packageDefined ? engine+"/Engine" : "djeo-"+engine+"/Engine");
			;
			// Check what we need to load
			// If we have a built version (has("djeo-built")==true), load built basic modules for the engine,
			// e.g Engine, Navigation, Highlight, Tooltip
			var requireMid = has("djeo-built") ?
				( (engine == "djeo") ? "./native" : "djeo-"+engine+"/"+engine ) :
				engineMid
			;
			// now require the engine
			require(["require", requireMid], lang.hitch(this, function(require) {
				// if we are in an unbuilt version, request engine module again
				// if we are in a built version, request engine module from the just loaded build
				require([engineMid], lang.hitch(this, function(engineClass) {
					// setup and mixin options
					var options = {};
					if (this.engineOptions[engine]) {
						lang.mixin(options, this.engineOptions[engine]);
					}
					if (engineOptions) {
						lang.mixin(options, engineOptions);
					}
					options.map = this;
					engine = new engineClass(options);
					this._initializeEngine(engine);
				}));
			}));
		}
		else {
			if (!engine.initialized) {
				this._initializeEngine(engine);
			}
			else {
				this.engine = engine;
				this._onEngineReady();
			}
		}
	},
	
	_initializeEngine: function(engine) {
		this._calculateViewport();
		engine.initialize(lang.hitch(this, function(){
			this.engine = engine;
			this._onEngineReady();
		}));
	},
	
	getBbox: function() {
		// summary:
		//		Calculates a 2D bounding box for the map
		// returns: Array
		//		[smallest horizontal coordinate, smallest vertical coordinate, largest horizontal coordinate, largest vertical coordinate]
		return this.document.getBbox();
	},
	
	destroy: function() {
		// summary:
		//		Destroys the map
		
		// TODO: provide more thorough implementation
		this.engine.destroy();
	},

	getCoords: function(/* Array */coords, /* String? */type) {
		// summary:
		//		Returns feature coordinates in the map projection.
		//		If module djeo.projection is loaded, the coordinates are converted to
		//		the map projection. Otherwise it is returned intact
		// returns:
		//		feature coordinates in the map projection
		return coords;
	},

	executeBatch: function(/* Function */batchFunction) {
		// summary:
		//		Executes the batchFunction in the batch mode
		//		if the map engine provides batching mode (like Google Earth javascript API).
		//		Otherwise just executes the batchFunction
		var engine = this.engine;
		if (engine.executeBatch) engine.executeBatch(batchFunction);
		else batchFunction();
	},

	zoomTo: function(/* Array | String | Object */extent) {
		// summary:
		//		Zooms the map to the given extent or to a single feature or to an array features (or their ids).
		//		The feature can be specified either by its javascript object or by its id
		var validExtent;
		if (lang.isArray(extent)) {
			// check if we have an array of features or a real extent (an array of coordinates)
			if (lang.isString(extent[0]) || lang.isObject(extent[0])) {
				var validExtent = [Infinity,Infinity,-Infinity,-Infinity];
				array.forEach(extent, function(feature){
					if (lang.isString(feature)) feature = this.getFeatureById(extent);
					if (feature) g.util.bbox.extend(validExtent, feature.getBbox());
				}, this);
			}
			else validExtent = extent;
		}
		else if (lang.isString(extent)) {
			// extent is a feature id
			validExtent = this.getFeatureById(extent);
			if (validExtent) validExtent = validExtent.getBbox();
		}
		else if (lang.isObject(extent)) {
			// extent is a feature javascript object
			validExtent = extent.getBbox();
		}
		if (validExtent) this.engine.zoomTo(validExtent);
	}
});

});