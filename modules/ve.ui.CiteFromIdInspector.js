/**
 * Inspector to insert filled references using citoid service
 *
 * @class
 * @extends ve.ui.NodeInspector
 * @constructor
 * @param {Object} [config] Configuration options
 */
ve.ui.CiteFromIdInspector = function VeUiCiteFromIdInspector( config ) {
	// Parent constructor
	ve.ui.CiteFromIdInspector.super.call( this, config );

	this.referenceModel = null;
	this.staging = false;
	this.results = [];
	this.citeTools = [];
	this.templateTypeMap = null;
	this.lookupPromise = null;
	this.service = null;
	this.inDialog = '';
	this.currentAutoProcessPanel = null;

	this.$element.addClass( 've-ui-citeFromIdInspector' );
};

/* Inheritance */

OO.inheritClass( ve.ui.CiteFromIdInspector, ve.ui.NodeInspector );

/* Static properties */

ve.ui.CiteFromIdInspector.static.name = 'citefromid';

ve.ui.CiteFromIdInspector.static.title = OO.ui.deferMsg( 'citoid-citefromiddialog-title' );

ve.ui.CiteFromIdInspector.static.size = 'large';

ve.ui.CiteFromIdInspector.static.modelClasses = [ ve.dm.MWReferenceNode ];

/**
 * The string used in TemplateData to identify the correct Map object
 *
 * @static
 * @property {string}
 * @inheritable
 */
ve.ui.CiteFromIdInspector.static.templateDataName = 'citoid';

/**
 * The requested format from the citoid client, passed as a GET parameter
 *
 * @static
 * @property {string}
 * @inheritable
 */
ve.ui.CiteFromIdInspector.static.citoidFormat = 'mediawiki';

ve.ui.CiteFromIdInspector.static.actions = [
	{
		label: OO.ui.deferMsg( 'visualeditor-dialog-action-cancel' ),
		flags: [ 'safe', 'back' ],
		modes: [ 'auto-lookup', 'manual', 'reuse' ]
	},
	{
		action: 'back',
		label: OO.ui.deferMsg( 'citoid-citefromiddialog-back' ),
		flags: [ 'safe', 'back' ],
		modes: [ 'auto-result' ]
	}
];

ve.ui.CiteFromIdInspector.static.citationToolsLimit = 5;

/* Methods */

/**
 * @inheritdoc
 */
ve.ui.CiteFromIdInspector.prototype.initialize = function () {
	var lookupActionFieldLayout,
		lookupFieldset = new OO.ui.FieldsetLayout(),
		limit = this.constructor.static.citationToolsLimit;

	// Parent method
	ve.ui.CiteFromIdInspector.super.prototype.initialize.call( this );

	try {
		this.templateTypeMap = JSON.parse( mw.message( 'citoid-template-type-map.json' ).plain() );
	} catch ( e ) { }
	// Get the available tools for their titles and icons
	try {
		// Must use mw.message to avoid JSON being parsed as Wikitext
		this.citeTools = JSON.parse( mw.message( 'cite-tool-definition.json' ).plain() );
	} catch ( e ) { }

	if ( !this.citeTools ) {
		try {
			// Must use mw.message to avoid JSON being parsed as Wikitext
			this.citeTools = JSON.parse( mw.message( 'visualeditor-cite-tool-definition.json' ).plain() );
		} catch ( e ) { }
	}

	// Limit the number of tools
	this.citeTools.splice( limit );

	// API for citoid service
	this.service = new mw.Api( {
		ajax: {
			url: mw.config.get( 'wgCitoidConfig' ).citoidServiceUrl,
			// Request content language of wiki from citoid service
			headers: { 'accept-language': mw.config.get( 'wgContentLanguage' ) },
			dataType: 'json',
			crossDomain: false, // Support IE9: T134928
			timeout: 20 * 1000, // 20 seconds
			type: 'GET'
		}
	} );

	// Modes
	this.modeIndex = new OO.ui.IndexLayout( {
		expanded: false,
		scrollable: false
	} );

	this.modePanels = {
		auto: new OO.ui.CardLayout( 'auto', {
			label: ve.msg( 'citoid-citefromiddialog-mode-auto' ),
			classes: [ 'citoid-citeFromIDDialog-panel-auto' ],
			padded: true,
			expanded: false,
			scrollable: false
		} ),
		manual: new OO.ui.CardLayout( 'manual', {
			label: ve.msg( 'citoid-citefromiddialog-mode-manual' ),
			classes: [ 'citoid-citeFromIDDialog-panel-manual' ],
			padded: true,
			expanded: false,
			scrollable: false
		} ),
		reuse: new OO.ui.CardLayout( 'reuse', {
			label: ve.msg( 'citoid-citefromiddialog-mode-reuse' ),
			classes: [ 'citoid-citeFromIDDialog-panel-reuse' ],
			expanded: false,
			scrollable: false
		} )
	};

	this.modeIndex.addCards( [
		this.modePanels.auto,
		this.modePanels.manual,
		this.modePanels.reuse
	] );

	// Auto mode
	this.autoProcessStack = new OO.ui.StackLayout( {
		expanded: false,
		scrollable: false
	} );

	this.autoProcessPanels = {
		lookup: new OO.ui.PanelLayout( {
			classes: [ 'citoid-citeFromIDDialog-panel-lookup' ],
			expanded: false,
			scrollable: false
		} ),
		result: new OO.ui.PanelLayout( {
			classes: [ 'citoid-citeFromIDDialog-panel-result' ],
			expanded: false,
			scrollable: false
		} )
	};

	// Lookup fieldset
	this.lookupInput = new OO.ui.TextInputWidget( {
		multiline: false,
		placeholder: ve.msg( 'citoid-citefromiddialog-search-placeholder' )
	} );

	this.lookupButton = new OO.ui.ButtonWidget( {
		label: ve.msg( 'citoid-citefromiddialog-lookup-button' )
	} );
	lookupActionFieldLayout = new OO.ui.ActionFieldLayout( this.lookupInput, this.lookupButton, {
		align: 'top',
		label: ve.msg( 'citoid-citefromiddialog-search-label' )
	} );

	lookupFieldset.$element.append(
		lookupActionFieldLayout.$element
	);

	// Error label
	this.$noticeLabel = $( '<div>' ).addClass( 've-ui-citeFromIdInspector-dialog-error oo-ui-element-hidden' ).text(
		ve.msg( 'citoid-citefromiddialog-use-general-error-message' )
	);

	this.autoProcessPanels.lookup.$element.append( lookupFieldset.$element, this.$noticeLabel );

	this.modePanels.auto.$element.append( this.autoProcessStack.$element );

	// Preview fieldset
	this.previewSelectWidget = new ve.ui.CiteFromIdGroupWidget();
	this.credit = new OO.ui.Element( {
		tag: 'div',
		text: OO.ui.deferMsg( 'citoid-citefromiddialog-credit', [ 'Zotero' ] ),
		classes: [ 've-ui-citeFromIdInspector-credit' ]
	} );
	this.autoProcessPanels.result.$element.append( this.previewSelectWidget.$element );

	// Manual mode
	this.sourceSelect = new ve.ui.CiteSourceSelectWidget( {
		classes: [ 've-ui-citeFromIdInspector-sourceSelect' ]
	} );
	this.modePanels.manual.$element.append( this.sourceSelect.$element );

	// Re-use mode
	this.search = new ve.ui.MWReferenceSearchWidget( {
		classes: [ 've-ui-citeFromIdInspector-search' ]
	} );
	this.modePanels.reuse.$element.append( this.search.$element );

	// Events
	this.modeIndex.connect( this, { set: 'onModeIndexSet' } );
	this.lookupInput.connect( this, {
		change: 'onLookupInputChange',
		enter: 'onLookupInputEnter'
	} );
	this.lookupButton.connect( this, { click: 'onLookupButtonClick' } );
	this.previewSelectWidget.connect( this, { choose: 'onPreviewSelectWidgetChoose' } );
	this.sourceSelect.connect( this, { choose: 'onSourceSelectChoose' } );
	this.search.getResults().connect( this, { choose: 'onSearchResultsChoose' } );

	this.autoProcessStack.addItems( [
		this.autoProcessPanels.lookup,
		this.autoProcessPanels.result
	] );

	// Attach
	this.form.$element
		.addClass( 've-ui-citeFromIdInspector-form' )
		.append( this.modeIndex.$element );
};

/**
 * Handle set events from mode index layout
 *
 * @param {OO.ui.CardLayout} card Set card
 */
ve.ui.CiteFromIdInspector.prototype.onModeIndexSet = function ( card ) {
	this.setModePanel( card.getName(), null, true );
};

/**
 * Switch to a specific mode panel
 *
 * @param {string} cardName Panel name, 'auto', 'manual' or 'reuse'
 * @param {string} [processPanelName] Process panel name, 'lookup' or 'result'
 * @param {boolean} [fromSelect] Mode was changed by the select widget
 */
ve.ui.CiteFromIdInspector.prototype.setModePanel = function ( cardName, processPanelName, fromSelect ) {
	var inspector = this;

	if ( [ 'auto', 'manual', 'reuse' ].indexOf( cardName ) === -1 ) {
		cardName = 'auto';
	} else if ( cardName === 'reuse' && this.modeIndex.getCard( 'reuse' ).tabItem.isDisabled() ) {
		cardName = 'auto';
	} else if ( cardName !== ( ve.userConfig( 'citoid-mode' ) || 'auto' ) ) {
		ve.userConfig( 'citoid-mode', cardName );
	}

	if ( !fromSelect ) {
		this.modeIndex.setCard( cardName );
	}
	switch ( cardName ) {
		case 'auto':
			processPanelName = processPanelName || this.currentAutoProcessPanel || 'lookup';
			this.autoProcessStack.setItem( this.autoProcessPanels[ processPanelName ] );
			switch ( processPanelName ) {
				case 'lookup':
					this.lookupInput.setDisabled( false ).focus().select();
					break;
				case 'result':
					this.previewSelectWidget.items[ 0 ].focus();
					break;
			}
			this.currentAutoProcessPanel = processPanelName;
			break;
		case 'reuse':
			this.search.buildIndex();
			this.search.getQuery().focus();
			break;
	}
	// Result card goes 'fullscreen' by hiding the tab widget
	// TODO: Do this in a less hacky way
	this.modeIndex.toggleMenu( !( processPanelName && processPanelName === 'result' ) );
	this.actions.setMode( cardName + ( processPanelName ? '-' + processPanelName : '' ) );
	this.updateSize();
	// Hiding the menu is a 200ms transition, so resize again
	setTimeout( function () {
		inspector.updateSize();
	}, 200 );
};

/**
 * Handle source select choose events
 *
 * @param {OO.ui.OptionWidget} item Chosen item
 */
ve.ui.CiteFromIdInspector.prototype.onSourceSelectChoose = function ( item ) {
	var data = item.getData(),
		// Closing the dialog may unset some properties, so cache the ones we want
		fragment = this.getFragment(),
		manager = this.getManager();

	// Close this dialog then open the new dialog
	this.close().then( function () {
		manager.getSurface().execute( 'mwcite', 'open', data.windowName, $.extend( {
			fragment: fragment
		}, data.dialogData ) );
	} );
};

/**
 * Handle search results choose events.
 *
 * @param {ve.ui.MWReferenceResultWidget} item Chosen item
 */
ve.ui.CiteFromIdInspector.prototype.onSearchResultsChoose = function ( item ) {
	var ref = item.getData();

	ref.insertReferenceNode( this.getFragment() );
	this.getFragment().getSurface().applyStaging();

	this.close();
};

/**
 * Respond to preview select widget choose event
 *
 * @param {ve.ui.MWReferenceResultWidget} item Chosen item
 */
ve.ui.CiteFromIdInspector.prototype.onPreviewSelectWidgetChoose = function ( item ) {
	var fragment = this.fragment,
		surfaceModel = this.getFragment().getSurface(),
		doc = surfaceModel.getDocument(),
		internalList = doc.getInternalList(),
		index = item.getData();

	if ( this.results[ index ] ) {
		// Gets back contents of <ref> tag
		if ( this.inDialog !== 'reference' ) {
			item = this.referenceModel.findInternalItem( surfaceModel );
			fragment = this.getFragment().clone(
				new ve.dm.LinearSelection( doc, item.getChildren()[ 0 ].getRange() )
			);
		}

		this.results[ index ].transclusionModel.insertTransclusionNode( fragment, 'inline' );

		if ( this.staging ) {
			// Remove placeholder status
			this.getFragment().changeAttributes( { placeholder: false } );

			// HACK: Scorch the earth - this is only needed because without it,
			// the reference list won't re-render properly, and can be removed
			// once someone fixes that
			this.referenceModel.setDocument(
				doc.cloneFromRange(
					internalList.getItemNode( this.referenceModel.getListIndex() ).getRange()
				)
			);
			this.referenceModel.updateInternalItem( surfaceModel );

			// Apply staging
			surfaceModel.applyStaging();
			this.staging = false;
		}
		// Force a context change to show the correct context item as we may
		// have changed from a plain reference to a templated citation
		surfaceModel.emitContextChange();
		// Close the inspector
		this.close();
	}
};

/**
 * Respond to change value of the search input.
 *
 * @param {string} value Current value
 */
ve.ui.CiteFromIdInspector.prototype.onLookupInputChange = function ( value ) {
	if ( this.lookupPromise ) {
		// Abort existing promises
		this.lookupPromise.abort();
		this.lookupPromise = null;
	}
	this.lookupButton.setDisabled( value === '' );
};

/**
 * Handle enter events from the lookup input
 */
ve.ui.CiteFromIdInspector.prototype.onLookupInputEnter = function () {
	if ( !this.lookupButton.isDisabled() ) {
		this.onLookupButtonClick();
	}
};

/**
 * Handle click events from the lookup button, perform lookup
 */
ve.ui.CiteFromIdInspector.prototype.onLookupButtonClick = function () {
	this.executeAction( 'lookup' );
};

/**
 * @inheritdoc
 */
ve.ui.CiteFromIdInspector.prototype.getSetupProcess = function ( data ) {
	return ve.ui.CiteFromIdInspector.super.prototype.getSetupProcess.call( this, data )
		.next( function () {
			var fragment;

			// Reset
			this.lookupPromise = null;
			this.staging = false;
			this.results = [];
			this.lookupButton.setDisabled( true );
			this.inDialog = data.inDialog || '';
			this.replaceNode = data.replace && this.getSelectedNode();

			// Collapse returns a new fragment, so update this.fragment
			if ( !this.replaceNode ) {
				this.fragment = this.getFragment().collapseToEnd().select();
			}

			this.search.setInternalList( this.getFragment().getDocument().getInternalList() );
			this.modeIndex.getCard( 'reuse' ).tabItem.setDisabled( this.search.isIndexEmpty() );

			if ( this.replaceNode ) {
				this.referenceModel = ve.dm.MWReferenceModel.static.newFromReferenceNode( this.replaceNode );
			} else {
				// Create model
				this.referenceModel = new ve.dm.MWReferenceModel( this.fragment.getDocument() );

				if ( this.inDialog !== 'reference' ) {
					this.staging = true;
					fragment = this.getFragment();
					// Stage an empty reference
					fragment.getSurface().pushStaging();

					// Insert an empty reference
					this.referenceModel.insertInternalItem( fragment.getSurface() );
					this.referenceModel.insertReferenceNode( fragment, true );
					fragment.select();
				}
			}

			if ( data.lookup ) {
				this.lookupInput.setValue( data.lookup );
				this.executeAction( 'lookup' );
			}

			this.modeIndex.setCard( data.lookup ? 'auto' : ( ve.userConfig( 'citoid-mode' ) || 'auto' ) );
		}, this );
};

/**
 * @inheritdoc
 */
ve.ui.CiteFromIdInspector.prototype.getReadyProcess = function ( data ) {
	return ve.ui.CiteFromIdInspector.super.prototype.getReadyProcess.call( this, data )
		.next( function () {
			// Set the panel after ready as it focuses the input too
			var mode = data.lookup ? 'auto' : ( ve.userConfig( 'citoid-mode' ) || 'auto' );
			this.setModePanel( mode, mode === 'auto' ? 'lookup' : undefined );
		}, this );
};

/**
 * @inheritdoc
 */
ve.ui.CiteFromIdInspector.prototype.getTeardownProcess = function ( data ) {
	return ve.ui.CiteFromIdInspector.super.prototype.getTeardownProcess.call( this, data )
		.first( function () {
			if ( this.staging ) {
				this.fragment.getSurface().popStaging();
			}

			// Empty the input
			this.lookupInput.setValue( null );

			// Clear selection
			this.sourceSelect.selectItem();

			// Clear credit line
			this.credit.$element.remove();

			// Reset
			if ( this.lookupPromise ) {
				this.lookupPromise.abort();
			}
			this.lookupPromise = null;
			this.clearResults();
			this.referenceModel = null;
			this.currentAutoProcessPanel = null;
		}, this );
};

/**
 * Clear the search results
 */
ve.ui.CiteFromIdInspector.prototype.clearResults = function () {
	this.results = [];
	this.previewSelectWidget.clearItems();
	this.updateSize();
};

/**
 * @inheritdoc
 */
ve.ui.CiteFromIdInspector.prototype.getActionProcess = function ( action ) {
	if ( action === 'lookup' ) {
		return new OO.ui.Process( function () {
			// Clear the results
			this.clearResults();
			// Look up
			return this.performLookup();
		}, this );
	}
	if ( action === 'back' ) {
		return new OO.ui.Process( function () {
			// Clear the results
			this.setModePanel( 'auto', 'lookup' );
			// Clear credit line
			this.credit.$element.remove();
		}, this );
	}
	// Fallback to parent handler
	return ve.ui.CiteFromIdInspector.super.prototype.getActionProcess.call( this, action );
};

/**
 * Send a request to the citoid service
 *
 * @return {jQuery.Promise} Lookup promise
 */
ve.ui.CiteFromIdInspector.prototype.performLookup = function () {
	var xhr,
		search,
		inspector = this;

	// TODO: Add caching for requested urls
	if ( this.lookupPromise ) {
		// Abort existing lookup
		this.lookupPromise.abort();
		this.lookupPromise = null;
		this.lookupInput.popPending();
	}
	// Set as pending
	this.lookupButton.setDisabled( true );
	this.lookupInput.setDisabled( true ).pushPending();

	search = this.lookupInput.getValue();
	// Common case: pasting a URI into this field. Citoid expects
	// minimally encoded input, so do some speculative decoding here to
	// avoid 404 fetches. T146539
	search = ve.safeDecodeURIComponent( search );

	// We have to first set up a get response so we can have
	// a proper xhr object with "abort" method, so we can
	// hand off this abort method to the jquery promise
	xhr = this.service
		.get( {
			search: search,
			format: ve.ui.CiteFromIdInspector.static.citoidFormat,
			basefields: 'true' // Request base fields from API i.e. publicationTitle instead of websiteTitle
		} );

	this.lookupPromise = xhr
		.then(
			// Success
			function ( searchResults ) {
				// Build results
				return inspector.buildTemplateResults( searchResults )
					.then( function () {
						inspector.setModePanel( 'auto', 'result' );
					}, function () {
						inspector.lookupFailed();
						return $.Deferred().resolve();
					} );
			},
			// Fail
			function ( type, response ) {
				if ( response && response.textStatus === 'abort' ) {
					return $.Deferred().reject();
				}
				inspector.lookupFailed();
				return $.Deferred().resolve();
			} )
		.always( function () {
			inspector
				.lookupInput
				.setDisabled( false )
				// restore focus to the input field
				.focus()
				.popPending();
			inspector.lookupButton.setDisabled( false );
		} )
		.promise( { abort: xhr.abort } );
	return this.lookupPromise;
};

/**
 * Set the auto panel to the error-state
 */
ve.ui.CiteFromIdInspector.prototype.lookupFailed = function () {
	// Enable the input and lookup button
	this.$noticeLabel.removeClass( 'oo-ui-element-hidden' );
	this.lookupInput.once( 'change', function () {
		this.$noticeLabel.addClass( 'oo-ui-element-hidden' );
		this.updateSize();
	}.bind( this ) ).setValidityFlag( false );
	this.updateSize();
};

/**
 * Insert filled template based on search results from citoid service
 *
 * @param {Object[]} searchResults Array of citation objects from citoid service
 * @return {jQuery.Promise} Promise that is resolved when the template part is added
 *  or is rejected if there are any problems with the template name or the internal item.
 */
ve.ui.CiteFromIdInspector.prototype.buildTemplateResults = function ( searchResults ) {
	var i, templateName, citation, result, refWidget,
		renderPromises = [],
		partPromises = [],
		inspector = this;

	for ( i = 0; i < searchResults.length; i++ ) {
		citation = searchResults[ i ];
		templateName = this.templateTypeMap[ citation.itemType ];

		// if TemplateName is undefined, this means that items of this citoid
		// type does not have a Template defined within the message.
		if ( !templateName ) {
			continue;
		}

		// Create models for this result
		this.results.push( {
			templateName: templateName,
			template: null,
			source: citation.source, // May be undefined or Array
			transclusionModel: new ve.dm.MWTransclusionModel()
		} );
		result = this.results[ this.results.length - 1 ];

		result.template = ve.dm.MWTemplateModel.newFromName( result.transclusionModel, templateName );

		partPromises.push(
			result.transclusionModel.addPart( result.template )
				// Fill in the details for the individual template
				.then( ve.ui.CiteFromIdInspector.static.populateTemplate.bind( this, result.template, citation ) )
		);
	}

	return $.when.apply( $, partPromises )
		.then( function () {
			var sources = [],
				optionWidgets = [];
			// Create option widgets
			for ( i = 0; i < inspector.results.length; i++ ) {
				refWidget = new ve.ui.CiteFromIdReferenceWidget(
					inspector.getFragment().getSurface().getDocument(),
					inspector.results[ i ].transclusionModel,
					{
						data: i,
						templateName: inspector.results[ i ].templateName,
						citeTools: inspector.citeTools
					} );
				sources.push( inspector.results[ i ].source ); // source may be undefined or Array of strings
				optionWidgets.push( refWidget );
				renderPromises.push( refWidget.getRenderPromise() );
			}
			if ( optionWidgets.length > 0 ) {
				// Add citations to the select widget
				inspector.previewSelectWidget.addItems( optionWidgets );
				// Add credit item only for result to the widget, currently for Zotero only
				if ( sources[ 0 ] && ( sources[ 0 ].indexOf( 'Zotero' ) > -1 ) ) {
					inspector.previewSelectWidget.$element.append( inspector.credit.$element );
				}
				return $.when.apply( $, renderPromises );
			}
			// failed, so go back
			return $.Deferred().reject();
		} );
};

/**
 * Fills template object parameters with values from the citation object
 *
 * @param {ve.dm.MNTemplateModel} template A template model to fill
 * @param {Object} citation An object that contains values to insert into template
 */
ve.ui.CiteFromIdInspector.static.populateTemplate = function ( template, citation ) {
	var citoidField, templateField, i, j,
		concatCitoidField, // for storing a concatenated citoid value composed of array elements
		concat2dField, // for storing elements of a 2d array converted to a 1d element
		spec = template.getSpec(),
		maps = spec.getMaps(),
		map = maps[ ve.ui.CiteFromIdInspector.static.templateDataName ];

	for ( citoidField in map ) {
		templateField = map[ citoidField ];
		concatCitoidField = null; // Wipe field from previous iteration

		// Construct parameters

		// Case: Citoid parameter directly equivalent to TemplateData parameter
		if ( typeof templateField === 'string' && citation[ citoidField ] && typeof citation[ citoidField ] === 'string' ) {
			template.addParameter(
				new ve.dm.MWParameterModel(
					template, templateField, citation[ citoidField ]
				)
			);
		// Case: Citoid parameter contains a 1 or 2D Array
		} else if ( citation[ citoidField ] && Array.isArray( citation[ citoidField ] ) ) {
			// Iterate through first dimension of array
			for ( i = 0; i < citation[ citoidField ].length; i++ ) {
				// Case: Citoid parameter equivalent to 1D Array of TD parameters
				if ( citation[ citoidField ][ i ] && typeof citation[ citoidField ][ i ] === 'string' ) {
					// Case: Citoid parameter equivalent to TD parameter
					if ( Array.isArray( templateField ) && templateField[ i ] &&
						typeof templateField[ i ] === 'string' ) {
						template.addParameter( new ve.dm.MWParameterModel(
							template, templateField[ i ], citation[ citoidField ][ i ] )
						);
					// Case: No equivalent TD parameter, add value to flattened string instead.
					} else if ( typeof templateField === 'string' ) {
						if ( !concatCitoidField ) {
							concatCitoidField = citation[ citoidField ][ i ];
						} else {
							concatCitoidField += ', ' + citation[ citoidField ][ i ];
						}
					}
				// Case: Citoid parameter equivalent to 2D Array of TD parameters
				} else if ( citation[ citoidField ][ i ] && Array.isArray( citation[ citoidField ][ i ] ) ) {
					concat2dField = null; // Wipe field from previous iteration

					// Iterate through inner dimension of array
					for ( j = 0; j < citation[ citoidField ][ i ].length; j++ ) {
						// Case: 2nd degree parameter exists
						if ( citation[ citoidField ][ i ][ j ] && typeof citation[ citoidField ][ i ][ j ] === 'string' ) {
							// Case: Citoid parameter equivalent to TD parameter
							if ( Array.isArray( templateField[ i ] ) &&
								templateField[ i ][ j ] && typeof templateField[ i ][ j ] === 'string' ) {
								template.addParameter(
									new ve.dm.MWParameterModel(
										template, templateField[ i ][ j ],
										citation[ citoidField ][ i ][ j ]
									)
								);
							// Case: Citoid parameter deeper than TD parameter
							} else if ( templateField[ i ] && typeof templateField[ i ] === 'string' ) {
								if ( !concat2dField ) {
									concat2dField = citation[ citoidField ][ i ][ j ];
								} else {
									concat2dField += ' ' + citation[ citoidField ][ i ][ j ];
								}
							}
						}
					}
					// Done iterating; Deal with concatenated values
					if ( concat2dField ) {
						// Case: Concat 2d value is equivalent to a 1d template field value
						if ( Array.isArray( templateField ) && typeof templateField[ i ] === 'string' ) {
							template.addParameter(
								new ve.dm.MWParameterModel(
									template, templateField[ i ], concat2dField
								)
							);
						// Case: Concat value is likely equivalent to a flat template field value
						} else {
							if ( !concatCitoidField ) {
								concatCitoidField = concat2dField;
							} else {
								concatCitoidField += ', ' + concat2dField;
							}
						}
					}
				}
			}
			// Done iterating; add final citoidConcatValue to TD
			if ( concatCitoidField ) {
				// Case: Concat value is equivalent to flat templateField value
				if ( templateField && typeof templateField === 'string' ) {
					template.addParameter(
						new ve.dm.MWParameterModel(
							template, templateField, concatCitoidField
						)
					);
				}
			}
		}
	}
};

/* Registration */

ve.ui.windowFactory.register( ve.ui.CiteFromIdInspector );
