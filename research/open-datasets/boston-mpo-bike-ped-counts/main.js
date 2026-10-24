// Main page of next-gen bike-ped counts web application
//
// Data: 1. GeoJSON for all count locations (geometry and attributes)
//		 2. 'counts' data - CSV file
//       3. 'selected count locations' - OpenLayers vector layer, derived from (1)
//       4. 'un-selectec count locations' - OpenLayers vectro layer, derived from (1)

// Mapping platform: OpenLayers
// Basemaps: MassGIS, Open Street Map
//
// Author: Ben Krepp, bkrepp@ctps.org

var bDebug = false; // Debug/diagnostics toggle


// Initial map parameters, specific to 'main' page
var initMapCenter = ol.proj.fromLonLat([-71.0589, 42.3601]);
var initMapZoom = 10;
var initMapView =  new ol.View({ center: initMapCenter, zoom:  initMapZoom });
var initMapExtent = []; // populated in initialize_map


// update_map:
// 		1. clear out vector layer for 'selected' countlocs
//      2. clear out vector layer for 'unselected' countlocs
// 		3. add selected countlocs to vector layer for it, and render it
//      4. add unselected countlocs to vector layer for it, and render it
// 		5. set extent of map based on bounding box of the _selected_ countlocs
// parametes:
//      1. 'selected_countlocs' is the array of GeoJSON features for the selected countlocs
//      2. 'unselected_countlocs' is the array of GeoJSON feature for the 'unselected' countlocs
//      3. 'set_extent' - boolean flag indicating if map exent should be set using the selectec countlocs
function update_map(selected_countlocs, unselected_countlocs, set_extent) {
	var vSource, vSource2, i, cur_countloc, feature, geom, props, extent, center, zoom, view;
	
	// Steps 1 and 2
	vSource = selected_countlocs_layer.getSource();
	vSource.clear();
	vSource2 = unselected_countlocs_layer.getSource();
	vSource2.clear();
	
	// Step 3
	for (i = 0; i < selected_countlocs.length; i++) {
		geom = {}, props = {};
		cur_countloc = selected_countlocs[i];
		geom =  new ol.geom.Point(ol.proj.fromLonLat([cur_countloc.geometry.coordinates[0], cur_countloc.geometry.coordinates[1]]));
		props = JSON.parse(JSON.stringify(cur_countloc.properties));
		feature = new ol.Feature({geometry: geom, properties: props});
		vSource.addFeature(feature);
	}
	selected_countlocs_layer.setSource(vSource);

	// Step 4
	for (i = 0; i < unselected_countlocs.length; i++) {
		geom = {}, props = {};
		cur_countloc = unselected_countlocs[i];
		geom =  new ol.geom.Point(ol.proj.fromLonLat([cur_countloc.geometry.coordinates[0], cur_countloc.geometry.coordinates[1]]));
		props = JSON.parse(JSON.stringify(cur_countloc.properties));
		feature = new ol.Feature({geometry: geom, properties: props});
		vSource2.addFeature(feature);
	}
	unselected_countlocs_layer.setSource(vSource2);	
	
	// Step 5
	// IF the 'set_extent' parameter is true, 
	// pan/zoom map to extent of selected count locations *within the Boston MPO area*.
	// The 'set_extent' parameter will only be false when the map is being initialized.
	if (set_extent) {
		// Take care to handle special case of 1 countloc - as best I can tell, such a case is always within the BRMPO area
		if (selected_countlocs.length == 1) {
			center = ol.proj.fromLonLat([selected_countlocs[0].geometry.coordinates[0], selected_countlocs[0].geometry.coordinates[1]]);
			zoom = 12; // Arbitrary choice, for now
			view = new ol.View({center: center, zoom: zoom});
			ol_map.setView(view);
		} else {
			// Get extent of selected countlocs WITHIN THE BOSTON MPO AREA, and pan/zoom map to it.
			// Create a dummy (invisible, non-rendered) vector layer to contain these countlocs, and get its extent.
			var filter_func = function(countloc) { return countloc.properties.mpo == 'Boston Region'; };
			var selected_countlocs_brmpo = _.filter(selected_countlocs, filter_func);
		    var selected_countlocs_brmpo_layer = new ol.layer.Vector({ source: new ol.source.Vector({ wrapX: false }) });
			var vSource3 = selected_countlocs_brmpo_layer.getSource();
			vSource3.clear(); // Just to be sure		
			for (i = 0; i < selected_countlocs_brmpo.length; i++) {
				geom = {}, props = {};
				cur_countloc = selected_countlocs_brmpo[i];
				geom =  new ol.geom.Point(ol.proj.fromLonLat([cur_countloc.geometry.coordinates[0], cur_countloc.geometry.coordinates[1]]));
				props = JSON.parse(JSON.stringify(cur_countloc.properties));
				feature = new ol.Feature({geometry: geom, properties: props});
				vSource3.addFeature(feature);
			}
			selected_countlocs_brmpo_layer.setSource(vSource3);
			extent = vSource3.getExtent();
			// Fitting the map's view precisely to the extent of the vector feature layer
			// causes some features to be placed exactly on the border of the visible map.
			// Add 50 pixels of padding 'around the edges' to make things look better.
			ol_map.getView().fit(extent, { size: ol_map.getSize(), duration: 1500, padding: [50, 50, 50, 50] });
		}
	}
	return;
} // update_map

// Update the jsGrid table with info about each selected count location
//
function update_table(countlocs) {
	var i, cl, data_array = [];
	
	// Populate 'data' array with info about the selected count locations
	for (i = 0; i < countlocs.length; i++) {
		cl = countlocs[i];
		// NOTE: cl.properties.loc_id has the B-P count location ID
		var a_tag = '<a href=countlocDetail.html?loc_id=' + cl.properties.loc_id;
		a_tag += ' target="_blank">' + cl.properties.description +'</a>';
		data_array.push({'countloc' : a_tag, 'town' : cl.properties.town, 'mpo' : cl.properties.mpo});
	}
		
	$("#output_table").jsGrid({
			height: "auto",
			width: "80%", 
			sorting: true,
			paging: true,
			data: data_array,
			fields: [
				{ name: "countloc", title: "Count Location", type: "text", width: 300 },
				{ name: "town", title: "Town", type: "text", width: 100 },
                { name: "mpo", title: "MPO", type: "text", width: 100 }
			]
	});
	$('#output_table').show();
} // update_table

// Return array of bp_loc_ids (B-P count locations) for a given set of counts
function counts_to_countloc_ids(counts) {
	var bp_loc_ids = _.map(counts, function(c) { return c.bp_loc_id; });
	bp_loc_ids = _.uniq(bp_loc_ids);
	return bp_loc_ids;
}
// counts_to_selected_countlocs:
//
// Abstractly, given an array of count records, 'counts' return an array
// of the count locations for these counts. 
// In practice, 'counts' is an array of _currently selected_ set of counts records. 
// This function computes the array of count locations for these counts, i.e.,
// the 'selected countlocs'. It also computes the array of 'un-selected' count locations.
// Both of these are properties of an object, which is the return value of this function:
//
// var retval = { 'selected' : [], 'unselected' : [] };
//
function counts_to_selected_countlocs(counts) {
	var selected_countloc_ids, countloc_id_set, 
	    selected_countlocs, unselected_countlocs;
	var retval = { 'selected' : [], 'unselected' : [] };
	
	// HERE: We have an array of the selected counts
	//       We need to turn this into a set of selected count _locations_
	// Compute the 'selection set' of count locations.
	// God bless the people who wrote the ES6 language definition - performing these computations is easy now!
	selected_countloc_ids = counts_to_countloc_ids(counts);
	countloc_id_set = new Set(selected_countloc_ids);
	selected_countlocs = all_countlocs.filter(rec => countloc_id_set.has(rec.properties.loc_id));
	unselected_countlocs = all_countlocs.filter(rec => !countloc_id_set.has(rec.properties.loc_id));
	retval.selected = selected_countlocs;
	retval.unselected = unselected_countlocs;
	return retval;
}

// populate_town_control_from_list:
//
// Populate the select_town <select> element with the array of town aTowns
// If prepend_all_applic is TRUE, prepend the list of towns with 'All Applicable'
// If prepend_any is TRUE, prepend this list of towns with 'Any'
//
function populate_town_control_from_list(aTowns, prepend_all_applic, prepend_any) {
	// Disable on-change event handler for 'select_town'
	$('#select_town').off()
	// Clear-out, and populate pick list
	$('#select_town').empty();
	if (prepend_all_applic == true) {
		$('#select_town').append(new Option('All Applicable', 'All Applicable'));
	} 
	if (prepend_any == true) {
		$('#select_town').append(new Option('Any', 'Any'));	
	}
	aTowns.forEach(function(town) {
		$('#select_town').append(new Option(town, town));
	});
	// Re-enable on-change event handler for 'select_year'
	$('#select_town').on('change', year_pick_list_handler);	
}

// populate_year_control_from_list:
//
// Populate the select_year <select> element with the array of years, aYears
// If prepend_all_applic is TRUE, prepend the list of years with 'All Applicable'
// If prepend_any is TRUE, prepend this list of years with 'Any'
//
function populate_year_control_from_list(aYears, prepend_all_applic, prepend_any) {
	// Disable on-change event handler for 'select_year'
	$('#select_year').off()
	// Clear-out, and populate pick list
	$('#select_year').empty();
	if (prepend_all_applic == true) {
		$('#select_year').append(new Option('All Applicable', 'All Applicable'));
	} 
	if (prepend_any == true) {
		$('#select_year').append(new Option('Any', 'Any'));	
	}
	aYears.forEach(function(year) {
		$('#select_year').append(new Option(year, year));
	});
	// Re-enable on-change event handler for 'select_year'
	$('#select_year').on('change', year_pick_list_handler);	
}

// get unique_years_from_counts:
// 
// Given the input array of count records, 'counts',
// return an array of unique years (strings) sorted in _descending_ order
function get_uniqe_years_from_counts(counts) {
	var years, years_uniq;
	years = _.map(counts, function(count) { return count.count_date.substr(0,4); });
	years_uniq = _.uniq(years);
	years_uniq = years_uniq.sort().reverse();
	return years_uniq;
}

// get unique_towns_from_counts:
// 
// Given the input array of count records, 'counts',
// return an array of unique towns sorted in alphabetical order
function get_unique_towns_from_counts(counts) {
	var towns, towns_uniq;
	towns =  _.map(counts, function(count) { return count.town; });
	towns_uniq = _.uniq(towns);
	towns_uniq = towns_uniq.sort();	
	return towns_uniq;
} 


///////////////////////////////////////////////////////////////////////////////
// Event handlers for:
// 	1. 'change' event on 'town' pick-list
//  2. 'change' event on 'year' pick-list
//  3. 'click' event on 'clear filters' button
//
// town_pick_list_handler: On-change event handler for pick-lists of towns
//
// The job of this function is to:
//     1. respond appropriately to 'change' events on the 'select_town' <select> element,
//        by updating the 'select_year' <select> element (UI operations)
//     2. compute the current 'selection set' (and possibly the current'un-selection set) 
//        of count locations
//     3. call update_map to update the OpenLayers map, and
//        call update_table to update the jsGrid table
//
// Pseudo-code of the algorithm for (1):
// 
// IF (town == 'Any') THEN
//     clear all filters
// ELSE IF (town == 'All Applicable') THEN
//     // this choice will be present only if there is a selected
//     //    value in the 'year' <select> control
//     filter data, but using the selection in the _other_ <select> control,
//        i.e., the 'year' <select> control
// ELSE 
//     // A specific town has been selected
//     filter ddata based on selected town
//     form list of these towns, alphabetized
//     append 'All Applicable' to the head of this list
//     update the 'town' <select> control with these values
// ENDIF
// 
// *** TO BE INVESTIGATED ***
// This function and year_pick_list_handler process a 'town' or 'year' selection
// in symmetrical ways, which suggests they could be combined into a single function.
//
function town_pick_list_handler(e) {
	var	town, year, years_uniq,
		filter_func, 
		selected_counts, otemp, selected_countlocs;

	town = $("#select_town").val();
	year = $("#select_year").val();
	
	if (town == 'Any') {
		// Note that we do NOT continue with the common logic after 
		// the if-elseif-else block: We are effectively resetting 
		// the application and need to ensure that _no_ countlocs
		// are selected.
		clear_filters_handler(null);
		return;
	} else if (town == 'All Applicable') {
		// This choice will be present only if there is a selected
		// value in the 'year' <select> control.
		// Filter data, but using the selection in the _other_ <select> control,
		// i.e., the 'year' <select> control.
		filter_func = function(count) { return count.count_date.substr(0,4) == year; };
		selected_counts = _.filter(selected_counts, filter_func);
		// years_uniq = get_uniqe_years_from_counts(selected_counts); - only one real year in the list
		initialize_year_pick_list(all_counts);
		// Set the 'selected' value in the years <select> list to the 
		// year that was selected, i.e., the contents of  the 'year' variable.
		$("#select_year option[value='" + year + "']").attr('selected', 'selected');
	} else {
		// A specific town has been selected 
		filter_func = function(count) { return count.town == town; };
		selected_counts = _.filter(all_counts, filter_func);
		// If a specific year is selected, further filter selected_counts on its value
		if (year != 'Any' && year != 'All Applicable') {
			filter_func = function(count) { return count.count_date.substr(0,4) == year; };
			selected_counts = _.filter(selected_counts, filter_func);
		} else {
			// Populate 'year' <select> control
		    // selected_counts = _.filter(selected_counts, filter_func);
		    years_uniq = get_uniqe_years_from_counts(selected_counts);
		    populate_year_control_from_list(years_uniq, true, false);			
		}
	}
		
	otemp = counts_to_selected_countlocs(selected_counts);
	// Sanity check to handle the fact that currently, there are some (non-) towns 
	// with no associated count locations, e.g., 'Auburndale'.
	if (otemp.selected.length != 0) {
		update_map(otemp.selected, otemp.unselected, true);
		update_table(otemp.selected);	 
	} else {
		alert('No counts found for town = ' + town);
		return;
	}
} // town_pick_list_handler


// year_pick_list_handler: On-change event handler for pick-lists of years
//
// The job of this function is to:
//     1. respond appropriately to 'change' events on the 'select_year' <select> element,
//        by updating the 'select_town' <select> element (UI operations)
//     2. compute the current 'selection set' (and possibly the current'un-selection set) 
//        of count locations
//     3. call update_map to update the OpenLayers map, and
//        call update_table to update the jsGrid table
//
// Pseudo-code of the algorithm for (1):
// 
// IF (year == 'Any') THEN
//     clear all filters
// ELSE IF (year == 'All Applicable') THEN
//     // this choice will be present only if there is a selected
//     //    value in the 'town' <select> control
//     filter data, but using the selection in the _other_ <select> control,
//        i.e., the 'town' <select> control
// ELSE 
//     // A specific year has been selected
//     filter data based on selected year
//     form list of these years, in descending order
//     append 'All Applicable' to the head of this list
//     update the 'year' <select> control with these values
// ENDIF
// 
// *** TO BE INVESTIGATED ***
// This function and town_pick_list_handler process a 'town' or 'year' selection
// in symmetrical ways, which suggests they could be combined into a single function.
// 
function year_pick_list_handler(e) {
	var	town, year, towns_uniq,
		filter_func, 
		selected_counts, otemp, selected_countlocs;

	town = $("#select_town").val();
	year = $("#select_year").val();
	
	if (year == 'Any') {
		// Note that we do NOT continue with the common logic after 
		// the if-elseif-else block: We are effectively resetting 
		// the application and need to ensure that _no_ countlocs
		// are selected.
		clear_filters_handler(null);
		return;
	} else if (year == 'All Applicable') {
		// This choice will be present only if there is a selected
		// value in the 'town' <select> control.
		// Filter data, but using the selection in the _other_ <select> control,
		// i.e., the 'town' <select> control.
		filter_func = function(count) { return count.town == town; };
		selected_counts = _.filter(all_counts, filter_func);
		initialize_town_pick_list(all_counts);
		// Set the 'selected' value in the towns <select> list to the 
		// town that was selected, i.e., the contents of  the 'town' variable.
		$("#select_town option[value='" + town + "']").attr('selected', 'selected');
	} else {
		// A specific year has been selected 
		filter_func = function(count) { return count.count_date.substr(0,4) == year; };
		selected_counts = _.filter(all_counts, filter_func);
		// If a specific town is selected, further filter selected_counts on its value
		if (town != 'Any' && town != 'All Applicable') {
			filter_func = function(count) { return count.town == town; };
			selected_counts = _.filter(selected_counts, filter_func);
		} else {
			// Populate 'town' <select> control
		    selected_counts = _.filter(selected_counts, filter_func);
		    towns_unique = get_unique_towns_from_counts(selected_counts);
		    populate_town_control_from_list(towns_unique, true, false);			
		}
	}
	
	otemp = counts_to_selected_countlocs(selected_counts);
	update_map(otemp.selected, otemp.unselected, true);
	update_table(otemp.selected);		
} // year_pick_list_handler

// clear_filters_handler: on-click event handler for 'clear filters' button
// 
function clear_filters_handler(e) {
	// Re-initialize 'selected' countlocs layer
	var vSource;
	vSource = selected_countlocs_layer.getSource();
	vSource.clear();
	selected_counts = [];
	// Clear overlay popup - just in case
	overlay.setPosition(undefined);
	closer.blur();
	// Set map extent 
	ol_map.getView().fit(initMapExtent, { size: ol_map.getSize(), duration: 1000});
	initialize_pick_lists(all_counts);
	$('#output_table').hide();
} // on-click handler for 'clear filters'

// initialize_town_pick_list - helper function for initialize_pick_lists
function initialize_town_pick_list(counts) {
	var towns, towns_uniq;
	
	towns = _.map(counts, function(c) { return c.town; });
	towns_uniq = _.uniq(towns);
	towns_uniq = towns_uniq.sort(); // Alphabetize list of towns!
	
	$('#select_town').empty();
	$('#select_town').append(new Option("Any", "Any"));
	towns_uniq.forEach(function(town) {
		$('#select_town').append(new Option(town, town));
	});
}

// initialize_year_pick_list -- helper function for initialize_pick_list
function initialize_year_pick_list(counts) {
	var years, years_uniq;
	
	years = _.map(counts, function(c) { return c.count_date.substr(0,4); });
	years_uniq = _.uniq(years);
	// Reverse list of years so the latest year appears at the top-of-list
	years_uniq = years_uniq.sort().reverse();
	
	$('#select_year').empty();
	$('#select_year').append(new Option("Any", "Any"));
	years_uniq.forEach(function(year) {
		$('#select_year').append(new Option(year, year));
	})
}

// Populate the pick-lists with their initial values, based on all_counts
// (*not* all count locations, believe it or not)
// Note on passed-in parm:
// 		counts parameter == all_counts
function initialize_pick_lists(counts) {
	initialize_town_pick_list(counts);
	initialize_year_pick_list(counts);
} // initialize_pick_lists


function initialize_map(all_countlocs){
    $.ajax({ url: mgis_serviceUrls['topo_features'], jsonp: 'callback', dataType: 'jsonp', data: { f: 'json' }, 
             success: function(config) {     
        // Body of "success" handler starts here.
        // Get resolutions
        var tileInfo = config.tileInfo;
        var resolutions = [];
        for (var i = 0, ii = tileInfo.lods.length; i < ii; ++i) {
            resolutions.push(tileInfo.lods[i].resolution);
        }               
        // Get projection
        var epsg = 'EPSG:' + config.spatialReference.wkid;
        var units = config.units === 'esriMeters' ? 'm' : 'degrees';
        var projection = ol.proj.get(epsg) ? ol.proj.get(epsg) : new ol.proj.Projection({ code: epsg, units: units });                              
        // Get attribution
        var attribution = new ol.control.Attribution({ html: config.copyrightText });               
        // Get full extent
        var fullExtent = [config.fullExtent.xmin, config.fullExtent.ymin, config.fullExtent.xmax, config.fullExtent.ymax];
        
        var tileInfo = config.tileInfo;
        var tileSize = [tileInfo.width || tileInfo.cols, tileInfo.height || tileInfo.rows];
        var tileOrigin = [tileInfo.origin.x, tileInfo.origin.y];
        var urls;
        var suffix = '/tile/{z}/{y}/{x}';
        urls = [mgis_serviceUrls['topo_features'] += suffix];               
        var width = tileSize[0] * resolutions[0];
        var height = tileSize[1] * resolutions[0];     
        var tileUrlFunction, extent, tileGrid;               
        if (projection.getCode() === 'EPSG:4326') {
            tileUrlFunction = function tileUrlFunction(tileCoord) {
                var url = urls.length === 1 ? urls[0] : urls[Math.floor(Math.random() * (urls.length - 0 + 1)) + 0];
                return url.replace('{z}', (tileCoord[0] - 1).toString()).replace('{x}', tileCoord[1].toString()).replace('{y}', (-tileCoord[2] - 1).toString());
            };
        } else {
            extent = [tileOrigin[0], tileOrigin[1] - height, tileOrigin[0] + width, tileOrigin[1]];
            tileGrid = new ol.tilegrid.TileGrid({ origin: tileOrigin, extent: extent, resolutions: resolutions });
        }     

        // MassGIS basemap Layer 1 - topographic features
        var layerSource;
        layerSource = new ol.source.XYZ({ attributions: [attribution], projection: projection,
                                          tileSize: tileSize, tileGrid: tileGrid,
                                          tileUrlFunction: tileUrlFunction, urls: urls });
                          
        mgis_basemap_layers['topo_features'] = new ol.layer.Tile();
        mgis_basemap_layers['topo_features'].setSource(layerSource);
        mgis_basemap_layers['topo_features'].setVisible(true);
        
        // We make the rash assumption that since this set of tiled basemap layers were designed to overlay one another,
        // their projection, extent, and resolutions are the same.
        
         // MassGIS basemap Layer 2 - structures
        urls = [mgis_serviceUrls['structures'] += suffix];  
        layerSource = new ol.source.XYZ({ attributions: [attribution], projection: projection,
                                          tileSize: tileSize, tileGrid: tileGrid,
                                          tileUrlFunction: tileUrlFunction, urls: urls });;
        mgis_basemap_layers['structures'] = new ol.layer.Tile();
        mgis_basemap_layers['structures'].setSource(layerSource); 
        mgis_basemap_layers['structures'].setVisible(true);
        
        // MassGIS basemap Layer 3 - "detailed" features - these include labels
        urls = [mgis_serviceUrls['basemap_features'] += suffix];  
        layerSource = new ol.source.XYZ({ attributions: [attribution], projection: projection,
                                          tileSize: tileSize, tileGrid: tileGrid,
                                          tileUrlFunction: tileUrlFunction, urls: urls });
        mgis_basemap_layers['basemap_features'] = new ol.layer.Tile();
        mgis_basemap_layers['basemap_features'].setSource(layerSource);
        mgis_basemap_layers['basemap_features'].setVisible(true);

                       
        // MassGIS basemap Layer 4 - parcels - WE (CURRENTLY) DO NOT USE THIS LAYER
        // Code retained for reference purposes only
	/*
        urls = [mgis_serviceUrls['parcels'] += suffix];
        layerSource = new ol.source.XYZ({ attributions: [attribution], projection: projection,
                                          tileSize: tileSize, tileGrid: tileGrid,
                                          tileUrlFunction: tileUrlFunction, urls: urls });;
        mgis_basemap_layers['parcels'] = new ol.layer.Tile();
        mgis_basemap_layers['parcels'].setSource(layerSource);  
        mgis_basemap_layers['parcels'].setVisible(true);
	*/
	
		var mgis_basemap_layer_group = new ol.layer.Group({  title: 'MassGIS Basemap', 
													         type: 'base',
															 combine: true,
													         layers: [mgis_basemap_layers['topo_features'],
															          mgis_basemap_layers['structures'],
																	  mgis_basemap_layers['basemap_features'] ] });
		
		var basemap_layer_group = new ol.layer.Group( { title: 'Basemaps',
														layers: [ mgis_basemap_layer_group,
														          osm_basemap_layer,
																  mgis_imagery_layer ] });
		
		ol_map = new ol.Map({ layers: [	basemap_layer_group,
										ma_wo_brmpo_poly_wms,
										bike_layer_group,
										// bp_countlocs_wms,
										selected_countlocs_layer, // this is an OL vector layer
										unselected_countlocs_layer	// this is an OL vector layer
									],
							target: 'map',
							view:   initMapView,
							overlays: [overlay]
						});
		
		// Add layer switcher add-on conrol
		var layerSwitcher = new ol.control.LayerSwitcher({ tipLabel: 'Legend', // Optional label for button
                                                           groupSelectStyle: 'children', // Can be 'children' [default], 'group' or 'none'
														   activationMode: 'click',
                                                           startActive: true,
														   reverse: false // List layers in order they were added to the map
                                                         });
		ol_map.addControl(layerSwitcher);
						
		// Bind on-click event handler for OpenLayers map: interrogates selected_countlocs and unselected_countlocs layers
		ol_map.on('click', function(evt) { onclick_handler(evt); });
		
		// Populate map with all count locations - currently all count locations are 'un-selected'.
		// The last parameter (false) directs update_map to _not_ set the map extent; that was set in the ol.Map constructor, above.
		update_map([], all_countlocs, false)

		// Cache initial map extent for use in 'clear_filters_handler'
		var v = ol_map.getView();
		initMapExtent = v.calculateExtent();		
	}});	
} // initialize_map


function initialize() {
	// Load count data from CSV file
	d3.csv(countsURL, rowConverter).then(
		function(counts_data){
			all_counts = counts_data;
			// Load GeoJSON for count locations
			// Use local file for now, WFS request in production
			// For WFS request - remember to reproject to EPSG:4326!
			$.when(getJson(countlocsURL).done(function(bp_countlocs) {
				var ok = arguments[1] === 'success'; 
				if (ok === false) {
					alert("Failed to load GeoJSON for count locations successfully.");
					return; 
				} 
				all_countlocs = bp_countlocs.features;
				// Bind on-change event handlers for pick-list controls
				$('#select_town').on('change', town_pick_list_handler);
				$('#select_year').on('change', year_pick_list_handler);
				// Bind on-change event handler for 'clear_filters' button 
				$('#clear_filters').on('click', clear_filters_handler);
				// Bind event handler for 'download' button
				$('#download_all').on('click', function(e) { download_data(all_counts); });
				// Bind on-click event handler for 'metadata' button
				$('#metadata').bind('click', displayMetadata);
				initialize_map(all_countlocs);
				initialize_pick_lists(all_counts);
			}));
		});
} // initialize
