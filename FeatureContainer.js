define([
	"dojo/_base/declare", // declare
	"dojo/_base/lang", // isString, isArray
	"dojo/_base/array", // forEach
	"./_base",
	"./Feature",
	"./util/_base",
	"./util/bbox"
], function(declare, lang, array, djeo, Feature, u, bbox){

var fc = declare([Feature], {
	
	type: "FeatureContainer",
	
	isContainer: true,
	
	features: null,
	
	numVisibleFeatures: 0,
	
	constructor: function(featureDef, kwArgs) {
		if (this.features) {
			var features = this.features;
			this.features = [];
			this.addFeatures(features, true);
		}
		else this.features = [];
	},
	
	show: function(show) {
		if (show === undefined) show = true;
		if (this.features.length == 0) {
			// just notify parent
			this.parent._show(this, show, true);
		}
		array.forEach(this.features, function(feature){
			feature.show(show);
		}, this);
		if (this.visible != show) {
			this.visible = show;
		}
	},
	
	_show: function(feature, show, attrOnly){
		// if attrOnly==true don't call feature._show();
		if (show) {
			this.numVisibleFeatures++;
			if (!this.visible) {
				// set visibility to true
				this.visible = true;
			}
			if (this.numVisibleFeatures == 1) {
				// notify parent
				this.parent._show(this, true, true);
			}
		}
		else {
			this.numVisibleFeatures--;
			if (this.numVisibleFeatures==0){
				// notify parent
				this.parent._show(this, false, true);
			}
		}
		if (!attrOnly) {
			feature._show(show);
		}
	},
	
	addFeatures: function(/* Array */features, noRendering) {
		if (!lang.isArray(features)) features = [features];
		var addedFeatures = [];
		array.forEach(features, function(feature){
			if (feature.declaredClass) { // derived from djeo.Feature
				feature.setMap(this.map);
				feature.setParent(this);
				this.features.push(feature);
			}
			else {
				var featureType = feature.type ? feature.type : ( feature.features ? "FeatureContainer" : "Placemark" );
				var ctor = djeo.featureTypes[featureType];
				if (ctor) {
					feature = new ctor(feature, {map: this.map, parent: this});
					this.features.push(feature);
				}
			}
			if (feature.declaredClass) {
				feature.setMap(this.map);
				feature.setParent(this);
				this.map.registerFeature(feature);
				addedFeatures.push(feature);
			}
		}, this);
		if (!noRendering) this.map.renderFeatures(addedFeatures);
		return addedFeatures;
	},
	
	removeFeatures: function(features) {
		if (!lang.isArray(features)) features = [features];
		var removedFeatures = [];
		array.forEach(features, function(feature){
			feature = feature.declaredClass ? feature : this.map.getFeatureById(feature);
			if (feature) feature.remove();
		}, this);
		return removedFeatures;
	},
	
	remove: function() {
		this.removeFeatures(this.features);
	},
	
	getBbox: function() {
		if (this.features.length == 0) return null;

		var bb = [Infinity,Infinity,-Infinity,-Infinity];
		array.forEach(this.features, function(feature){
			bbox.extend(bb, feature.getBbox());
		}, this);
		return bb;
	},
	
	render: function(stylingOnly, theme) {
		return this.map.engine.renderContainer(this, stylingOnly, theme);
	},
	
	_render: function(stylingOnly, theme) {
		return this.map.engine._renderContainer(this, stylingOnly, theme);
	},
	
	getContainer: function() {
		if (!this.container) {
			this.container = this.map.engine.createContainer(this);
		}
		return this.container;
	},
	
	onForHandle: function(handle, kwArgs) {
		if (!this.features.length) return handle;
		if (kwArgs.events) {
			kwArgs.events = lang.isString(kwArgs.events) ? [kwArgs.events] : kwArgs.events;
		}
		handle = handle || u.uid();
		array.forEach(this.features, function(feature) {
			feature.onForHandle(handle, kwArgs);
		});
		return handle;
	},
	
	disconnect: function(handle, key, removeEventListener) {
		if (!this.features.length) return;
		array.forEach(this.features, function(feature) {
			feature.disconnect(handle, key, removeEventListener);
		});
	}
});

// register the constructor
djeo.featureTypes.FeatureContainer = fc;
djeo.featureTypes.FeatureCollection = fc;

return fc;
});
