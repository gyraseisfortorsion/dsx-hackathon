// common.js
// Data structures and functions used in both the 'main' and 'detail' pages, each of which is a separate 'single page app'.
// Mucu of what follows pertains to the OpenLayers map used in each page.

// Data source: count data
var countsURL = 'data/csv/bp_counts.csv';

// Data source: count locations 
var countlocsURL = 'data/json/ctps_bp_count_locations_pt.geo.json';

// Array of GeoJSON features for ALL count locations
var all_countlocs = [];

// Array of 'all counts' and 'selected counts'
var all_counts = [],
    selected_counts = [];
	
///////////////////////////////////////////////////////////////////////////////
// Stuff for OpenLayers mapping
//

// URLs for MassGIS basemap layer services
var mgis_serviceUrls = { 
    'topo_features'     :  "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_Topographic_Features_for_Basemap/MapServer",
    'basemap_features'  :  "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_Basemap_Detailed_Features/MapServer",
    'structures'        :  "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_Structures/MapServer",
    'parcels'           :  "https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/MassGIS_Level3_Parcels/MapServer"
};

// OpenLayers layers for MassGIS basemap layers used in our map
// NOTE: This is populated in initialize_map
var mgis_basemap_layers = { 'topo_features'     : null,     // bottom layer
                            'structures'        : null,     
                            'basemap_features'  : null,     // on top of 'structures' so labels aren't obscured
                            'parcels'           : null      // unused; not populated
};

// OpenLayers layer for OpenStreetMap basesmap layer
var osm_basemap_layer = new ol.layer.Tile({ source: new ol.source.OSM(),
											type: 'base',
											title: 'Open Street Map',
											visible: false }); 

var mgis_imagery_layer = new ol.layer.Tile({ source: new ol.source.XYZ({ attributions: ['MassGIS'],
                                                                         url: 'https://tiles.arcgis.com/tiles/hGdibHYSPO59RG1h/arcgis/rest/services/orthos2021/MapServer/tile/{z}/{y}/{x}'
                                                     }),
										     type: 'base',
											 title: 'MassGIS Aerial Imagery 2021',
                                             visible: false });

											   
// Varioius things for WMS and WFS layers
// First, folderol to allow the app to run on appsrvr3 as well as "in the wild"
var szServerRoot = location.protocol + '//' + location.hostname;
var nameSpace;
if (location.hostname.includes('appsrvr3')) {   
    szServerRoot += ':8080/geoserver/';  
	nameSpace = 'ctps_pg';
} else {
	// Temp hack to allow working from home
    // szServerRoot += '/maploc/';
	szServerRoot = 'https://www.ctps.org/maploc/';
	nameSpace = 'postgis';
}
var szWMSserverRoot = szServerRoot + '/wms'; 
var szWFSserverRoot = szServerRoot + '/wfs'; 

// Create WMS layers
var lrse_bikes_shared_use_wms = new ol.layer.Tile({ source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																					params	: { 'LAYERS': 'postgis:massdot_lrse_bikes_20230804', 
																								'STYLES': 'lrse_bikes_shared_use_path',
																								'TRANSPARENT': 'true'
																			  }
															}),
													title: 'Shared-Use Paths',	
													visible: true
												});

var lrse_bikes_protected_lane_wms = new ol.layer.Tile({ source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																					    params	: { 'LAYERS': 'postgis:massdot_lrse_bikes_20230804', 
																									'STYLES': 'lrse_bikes_protected_bike_lane',
																									'TRANSPARENT': 'true'
																			  }
																}),
														title: 'On-Road Protected Bike Lanes',	
													visible: true
												});	

var lrse_bikes_on_road_lane_wms = new ol.layer.Tile({ source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																					  params	: { 'LAYERS': 'postgis:massdot_lrse_bikes_20230804', 
																									'STYLES': 'lrse_bikes_on_road_bike_lane',
																									'TRANSPARENT': 'true'
																			  }
																}),
													title: 'On-Road Unprotected Bike Lanes',	
													visible: true
												});
												
var lrse_bikes_bp_priority_roadway_wms = new ol.layer.Tile({ source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																					  params	: { 'LAYERS': 'postgis:massdot_lrse_bikes_20230804', 
																									'STYLES': 'lrse_bikes_bp_priority_roadway',
																									'TRANSPARENT': 'true'
																			  }
																}),
													title: 'Bicycle and Pedestrian Priority Roadway',	
													visible: true
												});

var bike_layer_group = new ol.layer.Group({ title: 'Bicycle Facilities', 
											fold: 'open',
											layers: [lrse_bikes_shared_use_wms,
													 lrse_bikes_protected_lane_wms,
													 lrse_bikes_on_road_lane_wms,
													 lrse_bikes_bp_priority_roadway_wms
													 ] 
										});

var ma_wo_brmpo_poly_wms = new ol.layer.Tile({	source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																				params	: { 'LAYERS': 'postgis:ctps_ma_wo_brmpo_poly', 
																							'STYLES': 'polygon_gray_for_non_mpo_area',
																						   'TRANSPARENT': 'true'
																			  }
																}),
												title: 'Boston Region MPO Boundary',	
												visible: true
											});

var bp_countlocs_wms = new ol.layer.Tile({	source: new ol.source.TileWMS({ url		: szWMSserverRoot,
																			params	: { 'LAYERS': 'postgis:ctps_bp_count_locations_pt_20230809', 
																						'STYLES': 'a_point_blue',
																						'TRANSPARENT': 'true'
																			  }
																}),
											title: 'Bike and Pedestrian Count Locations',	
											visible: true
										});	

// Vector point layer for selected count locations, and associated style
var selected_countlocs_style = new ol.style.Style({ image: new ol.style.Circle({ radius: 7.0,
                                                                                 fill:   new ol.style.Fill({color: 'gold'}),
																				 stroke: new ol.style.Stroke({color: 'black', width: 1.0})
																				}) 
                                                                             });
var selected_countlocs_layer = new ol.layer.Vector({ title: 'Selected Count Locations',
								                     source: new ol.source.Vector({ wrapX: false }),
								                     style: selected_countlocs_style
								                   });
												   
// Vector point layer for 'un-selected' count locations, and associated style
var unselected_countlocs_style = new ol.style.Style({ image: new ol.style.RegularShape({ radius:   4.0,
                                                                                         points:   4,
																						 rotation: Math.PI/4,
                                                                                         fill:     new ol.style.Fill({color: 'blue'}),
																				         stroke:   new ol.style.Stroke({color: 'black', width: 0.1
																						 })
																				      }) 
                                                                             });	
var unselected_countlocs_layer = new ol.layer.Vector({ title: 'Other Count Locations',
								                       source: new ol.source.Vector({ wrapX: false }),
								                       style: unselected_countlocs_style
								                    });																			 

// OpenLayers 'map' object:
var ol_map = null;

// Elements that make up an OpenLayers popup 'overlay'
var container = document.getElementById('popup');
var content = document.getElementById('popup-content');
var closer = document.getElementById('popup-closer');

// Add a click handler to hide the popup
closer.onclick = function () { 
	overlay.setPosition(undefined);
	closer.blur();
	return false;
};

// Create an overlay to anchor the popup to the map
var overlay = new ol.Overlay({ element: container,
                               autoPan: { animation: { duration: 250 } }
                             });


function make_popup_content(feature) {
	var props, loc_id, counts, count_ids = [], uniq_count_ids = [], num_uniq_count_ids,
	    oldest_count_date, newest_count_date, 
	    newest_counts = [], newest_count_summary = {}, 
	    am_peak = 0,  pm_peak = 0, a_tag;
		
	props = feature.getProperties().properties;
	loc_id = props.loc_id;
	counts = _.filter(all_counts, function(c) { return c.bp_loc_id == loc_id; });
	
	// Defensive programming:
	// Believe it or not, there are some count locations with no counts!
	if (counts.length == 0) {
		content = 'No counts with count loc_id == ' + loc_id + ' found.';
		return content;
	}
	
	counts = _.sortBy(counts, [function(o) { return o.count_date.substr(0,10); }]);
	count_ids = _.map(counts, function(o) { return o.count_id; });
	uniq_count_ids = _.uniq(count_ids);
	num_uniq_count_ids = uniq_count_ids.length;
	
	oldest_count_date = counts[0].count_date.substr(0,10);
	newest_count_date = counts[counts.length-1].count_date.substr(0,10);
	newest_counts = _.filter(counts, function(c) { return c.count_date.substr(0,10) == newest_count_date; });
	
	newest_count_summary = summarize_set_of_counts_by_quarter_hour(newest_counts);
	// AM and PM peak for newest count
	am_peak = calc_am_peak(newest_count_summary);
	pm_peak = calc_pm_peak(newest_count_summary);
		  
	content = 'Location ID ' + loc_id + '</br>';
    content += props.description + '</br>';
	content += num_uniq_count_ids + ' count sessions</br>';
	content += 'Most recent count : ' + newest_count_date + '</br>';
	content += 'Total volume AM peak : ' + am_peak + '</br>';
	content += 'Total volume PM peak : ' + pm_peak + '</br>';
	content += 'Oldest count : ' + oldest_count_date + '</br>';	
	
	a_tag = '<a href=countlocDetail.html?loc_id=' + props.loc_id;
	a_tag += ' target="_blank">Open detail page</a>';	
    content += a_tag;
	
	return content;
} // make_popup_content

// onclick_handler: on-click event handler for OpenLayers map
//
// If there is a feature at the clicked location, calls
// make_popup_content to generate content for an OpenLayers
// popup, and then sets the popup's position on the map.
var onclick_handler = function(evt) {
	var pixel = evt.pixel,
	    features = [], feature, content, coordinate;
	const hitTolerance = 100;	// hit-test tolerance, in pixels
		
	if (ol_map.hasFeatureAtPixel(pixel, { 'hitTolerance': hitTolerance }) === true) {
		ol_map.forEachFeatureAtPixel(pixel, function(feature, layer) {
			features.push(feature);
		}, { 'hitTolerance': hitTolerance } );
		
		// At least for now, we'll just work with the 1st feature
		feature = features[0];
		content = document.getElementById('popup-content');
		coordinate = evt.coordinate;
		content.innerHTML = make_popup_content(feature);
		overlay.setPosition(coordinate);
	} else {
		overlay.setPosition(undefined);
		closer.blur();
	}
	return; 
} // onclick_handler


// End of stuff for OpenLayers mapping  
///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
// Miscellaneous utility functions used in either or both pages of the bike-ped count app

var getJson = function(url) { return $.get(url, null, 'json'); };

// getURLParameter:
// Utility function to return the value of the parameter named 'sParam' from the window's URL
function getURLParameter(sParam) {
	var sPageURL = window.location.search.substring(1);
	var sURLVariables = sPageURL.split('&');
	var i;
	for (i = 0; i < sURLVariables.length; i++ ) {
		var sParameterName = sURLVariables[i].split('=');
		if (sParameterName[0] == sParam) {
			return sParameterName[1];
		}
	}
	// If we get here, parameter not found
	return('');
} // gtetURLParameter()


// rowConverter:
// Utility function for parsing records of the input CSV file of count records,
// and returning an object contaiing the parsed data
var rowConverter = function(d) {
	return {
		id:				+d.id,
		bp_loc_id:		+d.bp_loc_id,
		count_id:		+d.count_id,
		town:			d.town,
		description:	d.description,
		temperature:	+d.temperature,
		sky:			+d.sky, // 'sky condition' is encoded as an integer
		count_type:		d.count_type,
		from_st_name:	d.from_st_name,
		from_st_dir:	d.from_st_dir,
		to_st_name:		d.to_st_name,
		to_st_dir:		d.to_st_dir,
		count_date:		d.count_date,
		count_dow:		d.count_dow,
		cnt_0630:		+d.cnt_0630,
		cnt_0645:		+d.cnt_0645,
		cnt_0700:		+d.cnt_0700,
		cnt_0715:		+d.cnt_0715,
		cnt_0730:		+d.cnt_0730,
		cnt_0745:		+d.cnt_0745,
		cnt_0800:		+d.cnt_0800,
		cnt_0815:		+d.cnt_0815,
		cnt_0830:		+d.cnt_0830,
		cnt_0845:		+d.cnt_0845,
		cnt_0900:		+d.cnt_0900,
		cnt_0915:		+d.cnt_0915,
		cnt_0930:		+d.cnt_0930,
		cnt_0945:		+d.cnt_0945,
		cnt_1000:		+d.cnt_1000,
		cnt_1015:		+d.cnt_1015,
		cnt_1030:		+d.cnt_1030,
		cnt_1045:		+d.cnt_1045,
		cnt_1100:		+d.cnt_1100,
		cnt_1115:		+d.cnt_1115,
		cnt_1130:		+d.cnt_1130,
		cnt_1145:		+d.cnt_1145,
		cnt_1200:		+d.cnt_1200,
		cnt_1215:		+d.cnt_1215,
		cnt_1230:		+d.cnt_1230,
		cnt_1245:		+d.cnt_1245,
		cnt_1300:		+d.cnt_1300,
		cnt_1315:		+d.cnt_1315,
		cnt_1330:		+d.cnt_1330,
		cnt_1345:		+d.cnt_1345,
		cnt_1400:		+d.cnt_1400,
		cnt_1415:		+d.cnt_1415,
		cnt_1430:		+d.cnt_1430,
		cnt_1445:		+d.cnt_1445,
		cnt_1500:		+d.cnt_1500,
		cnt_1515:		+d.cnt_1515,
		cnt_1530:		+d.cnt_1530,
		cnt_1545:		+d.cnt_1545,
		cnt_1600:		+d.cnt_1600,
		cnt_1615:		+d.cnt_1615,
		cnt_1630:		+d.cnt_1630,
		cnt_1645:		+d.cnt_1645,
		cnt_1700:		+d.cnt_1700,
		cnt_1715:		+d.cnt_1715,
		cnt_1730:		+d.cnt_1730,
		cnt_1745:		+d.cnt_1745,
		cnt_1800:		+d.cnt_1800,
		cnt_1815:		+d.cnt_1815,
		cnt_1830:		+d.cnt_1830,
		cnt_1845:		+d.cnt_1845,
		cnt_1900:		+d.cnt_1900,
		cnt_1915:		+d.cnt_1915,
		cnt_1930:		+d.cnt_1930,
		cnt_1945:		+d.cnt_1945,
		cnt_2000:		+d.cnt_2000,
		cnt_2015:		+d.cnt_2015,
		cnt_2030:		+d.cnt_2030,
		cnt_2045:		+d.cnt_2045,
		cnt_total:		+d.cnt_total
	};
} // rowConverter

// Various utilities for summarizing count data

// summarize_set_of_counts_by_quarter_hour: 
// Given an input array of 'counts' records, calculate the summary across all
// records for each 15-minute time period and return it in an object,
// keyed by of the form 'cnt_<hhmm>'.
function summarize_set_of_counts_by_quarter_hour(counts) {
	retval = { 'cnt_0630' : 0, 'cnt_0645' : 0,
               'cnt_0700' : 0, 'cnt_0715' : 0, 'cnt_0730' : 0, 'cnt_0745' : 0,
               'cnt_0800' : 0, 'cnt_0815' : 0, 'cnt_0830' : 0, 'cnt_0845' : 0,
               'cnt_0900' : 0, 'cnt_0915' : 0, 'cnt_0930' : 0, 'cnt_0945' : 0,
               'cnt_1000' : 0, 'cnt_1015' : 0, 'cnt_1030' : 0, 'cnt_1045' : 0,
               'cnt_1100' : 0, 'cnt_1115' : 0, 'cnt_1130' : 0, 'cnt_1145' : 0,
               'cnt_1200' : 0, 'cnt_1215' : 0, 'cnt_1230' : 0, 'cnt_1245' : 0,
               'cnt_1300' : 0, 'cnt_1315' : 0, 'cnt_1330' : 0, 'cnt_1345' : 0,
               'cnt_1400' : 0, 'cnt_1415' : 0, 'cnt_1430' : 0, 'cnt_1445' : 0,
               'cnt_1500' : 0, 'cnt_1515' : 0, 'cnt_1530' : 0, 'cnt_1545' : 0,
               'cnt_1600' : 0, 'cnt_1615' : 0, 'cnt_1630' : 0, 'cnt_1645' : 0,
               'cnt_1700' : 0, 'cnt_1715' : 0, 'cnt_1730' : 0, 'cnt_1745' : 0,
               'cnt_1800' : 0, 'cnt_1815' : 0, 'cnt_1830' : 0, 'cnt_1845' : 0,
               'cnt_1900' : 0, 'cnt_1915' : 0, 'cnt_1930' : 0, 'cnt_1945' : 0,
               'cnt_2000' : 0, 'cnt_2015' : 0, 'cnt_2030' : 0, 'cnt_2045' : 0
	}

	retval.cnt_0630 =  _.sum(_.map(counts, 'cnt_0630'));
	retval.cnt_0645 =  _.sum(_.map(counts, 'cnt_0645'));
	
	retval.cnt_0700 =  _.sum(_.map(counts, 'cnt_0700'));
	retval.cnt_0715 =  _.sum(_.map(counts, 'cnt_0715'));	
	retval.cnt_0730 =  _.sum(_.map(counts, 'cnt_0730'));	
	retval.cnt_0745 =  _.sum(_.map(counts, 'cnt_0745'));	

	retval.cnt_0800 =  _.sum(_.map(counts, 'cnt_0800'));	
	retval.cnt_0815 =  _.sum(_.map(counts, 'cnt_0815'));	
	retval.cnt_0830 =  _.sum(_.map(counts, 'cnt_0830'));	
	retval.cnt_0845 =  _.sum(_.map(counts, 'cnt_0845'));
	
	retval.cnt_0900 =  _.sum(_.map(counts, 'cnt_0900'));	
	retval.cnt_0915 =  _.sum(_.map(counts, 'cnt_0915'));	
	retval.cnt_0930 =  _.sum(_.map(counts, 'cnt_0930'));	
	retval.cnt_0945 =  _.sum(_.map(counts, 'cnt_0945'));	

	retval.cnt_1000 =  _.sum(_.map(counts, 'cnt_1000'));	
	retval.cnt_1015 =  _.sum(_.map(counts, 'cnt_1015'));	
	retval.cnt_1030 =  _.sum(_.map(counts, 'cnt_1030'));	
	retval.cnt_1045 =  _.sum(_.map(counts, 'cnt_1045'));	

	retval.cnt_1100 =  _.sum(_.map(counts, 'cnt_1100'));	
	retval.cnt_1115 =  _.sum(_.map(counts, 'cnt_1115'));	
	retval.cnt_1130 =  _.sum(_.map(counts, 'cnt_1130'));	
	retval.cnt_1145 =  _.sum(_.map(counts, 'cnt_1145'));	

	retval.cnt_1200 =  _.sum(_.map(counts, 'cnt_1200'));	
	retval.cnt_1215 =  _.sum(_.map(counts, 'cnt_1215'));	
	retval.cnt_1230 =  _.sum(_.map(counts, 'cnt_1230'));	
	retval.cnt_1245 =  _.sum(_.map(counts, 'cnt_1245'));	

	retval.cnt_1300 =  _.sum(_.map(counts, 'cnt_1300'));	
	retval.cnt_1315 =  _.sum(_.map(counts, 'cnt_1315'));	
	retval.cnt_1330 =  _.sum(_.map(counts, 'cnt_1330'));	
	retval.cnt_1345 =  _.sum(_.map(counts, 'cnt_1345'));	

	retval.cnt_1400 =  _.sum(_.map(counts, 'cnt_1400'));	
	retval.cnt_1415 =  _.sum(_.map(counts, 'cnt_1415'));	
	retval.cnt_1430 =  _.sum(_.map(counts, 'cnt_1430'));	
	retval.cnt_1445 =  _.sum(_.map(counts, 'cnt_1445'));	

	retval.cnt_1500 =  _.sum(_.map(counts, 'cnt_1500'));	
	retval.cnt_1515 =  _.sum(_.map(counts, 'cnt_1515'));	
	retval.cnt_1530 =  _.sum(_.map(counts, 'cnt_1530'));	
	retval.cnt_1545 =  _.sum(_.map(counts, 'cnt_1545'));	

	retval.cnt_1600 =  _.sum(_.map(counts, 'cnt_1600'));	
	retval.cnt_1615 =  _.sum(_.map(counts, 'cnt_1615'));	
	retval.cnt_1630 =  _.sum(_.map(counts, 'cnt_1630'));	
	retval.cnt_1645 =  _.sum(_.map(counts, 'cnt_1645'));	

	retval.cnt_1700 =  _.sum(_.map(counts, 'cnt_1700'));	
	retval.cnt_1715 =  _.sum(_.map(counts, 'cnt_1715'));	
	retval.cnt_1730 =  _.sum(_.map(counts, 'cnt_1730'));	
	retval.cnt_1745 =  _.sum(_.map(counts, 'cnt_1745'));	

	retval.cnt_1800 =  _.sum(_.map(counts, 'cnt_1800'));	
	retval.cnt_1815 =  _.sum(_.map(counts, 'cnt_1815'));	
	retval.cnt_1830 =  _.sum(_.map(counts, 'cnt_1830'));	
	retval.cnt_1845 =  _.sum(_.map(counts, 'cnt_1845'));	

	retval.cnt_1900 =  _.sum(_.map(counts, 'cnt_1900'));	
	retval.cnt_1915 =  _.sum(_.map(counts, 'cnt_1915'));	
	retval.cnt_1930 =  _.sum(_.map(counts, 'cnt_1930'));	
	retval.cnt_1945 =  _.sum(_.map(counts, 'cnt_1945'));	
	
	retval.cnt_2000 =  _.sum(_.map(counts, 'cnt_2000'));	
	retval.cnt_2015 =  _.sum(_.map(counts, 'cnt_2015'));	
	retval.cnt_2030 =  _.sum(_.map(counts, 'cnt_2030'));	
	retval.cnt_2045 =  _.sum(_.map(counts, 'cnt_2045'));	

	return retval;
} // summarize_set_of_counts_by_quarter_hour

// For all counts (or count_summaries) in the input array 'c',
// compute the sum of all count values for the AM peak peroid,
// and return it.
// The AM peak period defined as: 0630 to 0900 hours.
function calc_am_peak(c) {
	retval = ((c.cnt_0630 != null) ? c.cnt_0630 : 0) + 
	         ((c.cnt_0645 != null) ? c.cnt_0645 : 0) +
	         ((c.cnt_0700 != null) ? c.cnt_0700 : 0) +
			 ((c.cnt_0715 != null) ? c.cnt_0715 : 0) +
			 ((c.cnt_0730 != null) ? c.cnt_0730 : 0) + 
			 ((c.cnt_0745 != null) ? c.cnt_0745 : 0) +
		     ((c.cnt_0800 != null) ? c.cnt_0800 : 0) +
			 ((c.cnt_0815 != null) ? c.cnt_0815 : 0) +
			 ((c.cnt_0830 != null) ? c.cnt_0830 : 0) + 
			 ((c.cnt_0845 != null) ? c.cnt_0845 : 0);
	return retval;
} // calc_am_peak

// For all counts (or count_summaries) in the input array 'c',
// compute the sum of all count values for the PM peak peroid,
// and return it.
// The PM peak period defined as: 1600 to 1900 hours.
function calc_pm_peak(c) {
	retval = ((c.cnt_1600 != null) ? c.cnt_1600 : 0) +
	         ((c.cnt_1615 != null) ? c.cnt_1615 : 0) + 
			 ((c.cnt_1630 != null) ? c.cnt_1630 : 0) + 
			 ((c.cnt_1645 != null) ? c.cnt_1645 : 0) +
	         ((c.cnt_1700 != null) ? c.cnt_1700 : 0) + 
			 ((c.cnt_1715 != null) ? c.cnt_1715 : 0) +
			 ((c.cnt_1730 != null) ? c.cnt_1730 : 0) + 
			 ((c.cnt_1745 != null) ? c.cnt_1745 : 0) +
			 ((c.cnt_1800 != null) ? c.cnt_1800 : 0) +
		     ((c.cnt_1815 != null) ? c.cnt_1815 : 0) +
			 ((c.cnt_1830 != null) ? c.cnt_1830 : 0) +
			 ((c.cnt_1845 != null) ? c.cnt_1845 : 0);
	return retval;
} // calc_pm_peak

// summarize_set_of_counts_by_year_range:
// Given a set of counts, 'c', and a 'start_year' and 'end_year',
// return an array of (end_year - start_year + 1) elements,
// the value of each element being the total count for the given year.
// N.B. - Currently unused
function summarize_set_of_counts_by_year_range(c, start_year, end_year) {
	var retval = [], year, year_counts, year_sum;
	
	for (year = start_year; year <= end_year; year++) {
		year_counts = _.filter(c, function(rec) { return rec.count_date.substr(0,4) == year; });
		year_sum = year_counts.length == 0 ? 0
		                                   : _.sum(_.map(year_counts, function(c) { return c.cnt_total; }));
		retval.push(year_sum);
	}
	return retval;
} // summarize_set_of_counts_by_year_range

// Stuff for opening metadata page
function popup(url) {
    var popupWindow = window.open(url,'popUpWindow','height=700,width=800,left=10,top=10,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,directories=no,status=yes')
} // popup

displayMetadata = function() {
	popup('metadata.html');
}; // displayMetadata

// Format the array of data in 'counts' as CSV and download it
function download_data(counts) {
	var s; // string into which data to be downloaded in CSV format will be accumulated
	var header = "id,bp_loc_id,count_id,town,";
		header += "description,temperature,sky,count_type,";
		header += "from_st_name,from_st_dir,to_st_name,to_st_dir,count_date,count_dow,";
		header += "cnt_0630,cnt_0645,";
		header += "cnt_0700,cnt_0715,cnt_0730,cnt_0745,cnt_0800,cnt_0815,cnt_0830,cnt_0845,cnt_0900,cnt_0915,cnt_0930,cnt_0945,";
		header += "cnt_1000,cnt_1015,cnt_1030,cnt_1045,cnt_1100,cnt_1115,cnt_1130,cnt_1145,cnt_1200,cnt_1215,cnt_1230,cnt_1245,";
		header += "cnt_1300,cnt_1315,cnt_1330,cnt_1345,cnt_1400,cnt_1415,cnt_1430,cnt_1445,cnt_1500,cnt_1515,cnt_1530,cnt_1545,";
		header += "cnt_1600,cnt_1615,cnt_1630,cnt_1645,cnt_1700,cnt_1715,cnt_1730,cnt_1745,cnt_1800,cnt_1815,cnt_1830,cnt_1845,";
		header += "cnt_1900,cnt_1915,cnt_1930,cnt_1945,cnt_2000,cnt_2015,cnt_2030,cnt_2045,cnt_total";
		header += "\n";
		
		s = header;
		counts.forEach(function(c) {
            s += c.id + ',';
            s += c.bp_loc_id + ',';
            s += c.count_id + ',';
            s += c.town + ',';
            s += '"' + c.description + '",';
            s += c.temperature + ',';
            s += c.sky + ',';
            s += c.count_type + ',';
            s += c.from_st_name + ',';
            s += c.from_st_dir + ',';
            s += c.to_st_name + ',';
            s += c.to_st_dir + ',';
            s += '"' + c.count_date + '",';
            s += c.count_dow + ',';
            s += c.cnt_0630 + ',';
            s += c.cnt_0645 + ',';
            s += c.cnt_0700 + ',';
            s += c.cnt_0715 + ',';
            s += c.cnt_0730 + ',';
            s += c.cnt_0745 + ',';
            s += c.cnt_0800 + ',';
            s += c.cnt_0815 + ',';
            s += c.cnt_0830 + ',';
            s += c.cnt_0845 + ',';
            s += c.cnt_0900 + ',';
            s += c.cnt_0915 + ',';
            s += c.cnt_0930 + ',';
            s += c.cnt_0945 + ',';
            s += c.cnt_1000 + ',';
            s += c.cnt_1015 + ',';
            s += c.cnt_1030 + ',';
            s += c.cnt_1045 + ',';
            s += c.cnt_1100 + ',';
            s += c.cnt_1115 + ',';
            s += c.cnt_1130 + ',';
            s += c.cnt_1145 + ',';
            s += c.cnt_1200 + ',';
            s += c.cnt_1215 + ',';
            s += c.cnt_1230 + ',';
            s += c.cnt_1245 + ',';
            s += c.cnt_1300 + ',';
            s += c.cnt_1315 + ',';
            s += c.cnt_1330 + ',';
            s += c.cnt_1345 + ',';
            s += c.cnt_1400 + ',';
            s += c.cnt_1415 + ',';
            s += c.cnt_1430 + ',';
            s += c.cnt_1445 + ',';
            s += c.cnt_1500 + ',';
            s += c.cnt_1515 + ',';
            s += c.cnt_1530 + ',';
            s += c.cnt_1545 + ',';
            s += c.cnt_1600 + ',';
            s += c.cnt_1615 + ',';
            s += c.cnt_1630 + ',';
            s += c.cnt_1645 + ',';
            s += c.cnt_1700 + ',';
            s += c.cnt_1715 + ',';
            s += c.cnt_1730 + ',';
            s += c.cnt_1745 + ',';
            s += c.cnt_1800 + ',';
            s += c.cnt_1815 + ',';
            s += c.cnt_1830 + ',';
            s += c.cnt_1845 + ',';
            s += c.cnt_1900 + ',';
            s += c.cnt_1915 + ',';
            s += c.cnt_1930 + ',';
            s += c.cnt_1945 + ',';
            s += c.cnt_2000 + ',';
            s += c.cnt_2015 + ',';
            s += c.cnt_2030 + ',';
            s += c.cnt_2045 + ',';
            s += c.cnt_total + ',';
			s += "\n";
		});
		// HERE: 's' is the entire string to download
		download(s, 'bike_ped_counts', 'text/csv');
} // download_data