// ==UserScript==
// @name           Default Full Zoom Level
// @namespace      dfz@slimx.com
// @description    自动缩放页面,可以为所有页面指定默认的缩放值.转制自alice0775所做扩展.
// @include        main
// @charset        UTF-8
// @author         slimx
// @version        2.0.0.2
// @updateURL     https://j.mozest.com/ucscript/script/7.meta.js
// @note          2013/07/16追随L大更新，可设置显示按钮或者文字 by defpt
// @note          2013/07/15 modified by lastdream2013 修正恢复上次关闭网页时有可能在第一个页面失效的问题
// @note          2013/07/11 稍做修正，增加右键点击菜单项设置所有页面默认的缩放率
// ==/UserScript==

//@11/22 第一版
//@1/2/13 第二版
var FullZoomConfig = new function () {
	//按钮为图标或者文字：true 为图标， false 为文字
	this.showIconBtn = false;
	//默认的缩放级别
	this.defaultLv = 110;
	//只缩放文字
	this.Textmode = true;
	//是否应用于本地文件?
	this.localFolderSpecific = true;
	//自动适应窗口
	this.fitToWidth = false;
	//?
	this.forceFitToWidth = false;
	//?
	this.fitToWidthPreserveTextSize = false;
	//侧边栏宽度发生变化后,是否重新计算缩放
	this.reserveSidebarWidth = true;
	//自动适应窗口下的,最大值
	this.maximum = 200;
	//自动适应窗口下的,最小值
	this.minimum = 50;
	//忽略图片类型的文件
	this.ignoreImageDocument = true;

	//快捷菜单的缩放项目,需要注意的是最大值和最小值不能超过zoom.minPercent和zoom.maxPercent
	this.zoomValues = "0.8,0.85,0.9,0.95,1,1.05,1.1,1.15,1.2,1.25,1.30,1.35";
	//label
    this.fitToWindow = "适合窗口宽度";
    this.reset = " 默认值";
}
var FullZoom = {

    //**************************************************************************//
	// Name & Values

	// The name of the setting.  Identifies the setting in the prefs database.
	name : "browser.content.full-zoom",
	mode : "browser.content.full-mode",
	auto : "browser.content.full-AutoFit",
	lastInnerWidth : 0,

	// The global value (if any) for the setting.  Lazily loaded from the service
	// when first requested, then updated by the pref change listener as it changes.
	// If there is no global value, then this should be undefined.

	/*get globalValue() {
	var globalValue = FullZoomConfig.defaultLv;
	return this.globalValue = globalValue / 100;
	},*/
	globalValue : FullZoomConfig.defaultLv / 100,

	get globalMode() {
		//this.globalMode ; Text zoom or not
		var globalMode = !FullZoomConfig.Textmode;
		if (typeof globalMode == "undefined")
			globalMode = true;
		delete this.globalMode;
		return this.globalMode = globalMode;
	},
	get globalAuto() {
		//this.globalMode ; Auto Fit or not
		var globalAuto = FullZoomConfig.fitToWidth;
		if (typeof globalAuto == "undefined")
			globalAuto = false;
		delete this.globalAuto;
		return this.globalAuto = globalAuto;
	},
	get forceFitToWidth() {
		var forceFitToWidth = FullZoomConfig.forceFitToWidth;
		return this.forceFitToWidth = forceFitToWidth;
	},
	//For Bug 416661 Site-specific zoom level shouldn't apply to image documents
	get ignoreImageDocument() {
		var ignoreImageDocument = FullZoomConfig.ignoreImageDocument;
		return this.ignoreImageDocument = ignoreImageDocument;
	},

	//**************************************************************************//
	// Convenience Getters
	getContentPrefs : function getContentPrefs(aWindow) {
		Cu.import('resource://gre/modules/ContentPrefInstance.jsm');
		let context = aWindow ? aWindow.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
			.getInterface(Components.interfaces.nsIWebNavigation)
			.QueryInterface(Components.interfaces.nsILoadContext) : null;
		return new ContentPrefInstance(context);
	},
	// Content Pref Service
	get _cps() {
		delete this._cps;
		if (fullZoomBtn.getVer() >= 19)
			return this._cps = this.getContentPrefs(gBrowser.contentDocument.defaultView);
		else
			return this._cps = Cc["@mozilla.org/content-pref/service;1"].getService(Ci.nsIContentPrefService);
	},

	get _prefBranch() {
		delete this._prefBranch;
		return this._prefBranch = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch2); //nsIPrefBranch
	},

	// browser.zoom.siteSpecific preference cache
	_siteSpecificPref : undefined,

	// browser.zoom.updateBackgroundTabs preference cache
	updateBackgroundTabs : undefined,

	// whether we are in private browsing mode
	_inPrivateBrowsing : false,

	get siteSpecific() {
		return !this._inPrivateBrowsing && this._siteSpecificPref;
	},

	//**************************************************************************//
	// nsISupports

	/*
	interfaces: [Components.interfaces.nsIDOMEventListener,
	Components.interfaces.nsIObserver,
	Components.interfaces.nsIContentPrefObserver,
	Components.interfaces.nsISupportsWeakReference,
	Components.interfaces.nsISupports],

	QueryInterface: function FullZoom_QueryInterface(aIID) {
	if (!this.interfaces.some(function (v) aIID.equals(v)
	))
	throw Cr.NS_ERROR_NO_INTERFACE;
	return this;
	},*/
	QueryInterface : XPCOMUtils.generateQI([Ci.nsIDOMEventListener, Ci.nsIObserver, Ci.nsIContentPrefObserver, Ci.nsISupportsWeakReference, Ci.nsISupports]),

	//**************************************************************************//
	// Initialization & Destruction

	init : function FullZoom_init() {

		//on load
		// Listen for scrollwheel events so we can save scrollwheel-based changes.
		window.addEventListener("DOMMouseScroll", this, false);

		document.getElementById("cmd_fullZoomReset").setAttribute("oncommand", "FullZoom.resetZoom()");
		document.getElementById("cmd_fullZoomToggle").setAttribute("oncommand", "FullZoom.toggleZoom()");

		// Register ourselves with the service so we know when our pref changes.
		this._cps.addObserver(this.name, this);
		this._cps.addObserver(this.mode, this);

		// We disable site-specific preferences in Private Browsing mode, because the
		// content preferences module is disabled
		let os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		os.addObserver(this, "private-browsing", true);

		try {
			// Retrieve the initial status of the Private Browsing mode.
			this._inPrivateBrowsing = Cc["@mozilla.org/privatebrowsing;1"].getService(Ci.nsIPrivateBrowsingService).privateBrowsingEnabled;
		} catch (e) {
			this._inPrivateBrowsing = false;
		}

		this._siteSpecificPref = this._prefBranch.getBoolPref("browser.zoom.siteSpecific");
		this.localFolderSpecific = FullZoomConfig.localFolderSpecific;
		try {
			this.updateBackgroundTabs = this._prefBranch.getBoolPref("browser.zoom.updateBackgroundTabs");
		} catch (e) {}

		if (!this._prefBranch.prefHasUserValue("browser.zoom.defaultZoomValue")) {
			this._prefBranch.setCharPref("browser.zoom.defaultZoomValue", this.globalValue);
		} else {
			this.globalValue = this._ensureValid(parseFloat(this._prefBranch.getCharPref("browser.zoom.defaultZoomValue")));
		}

		// Listen for changes to the browser.zoom branch so we can enable/disable
		// updating background tabs and per-site saving and restoring of zoom levels.
		this._prefBranch.addObserver("browser.zoom.", this, true);
		//extension self
		//                this._prefBranch.addObserver("extensions.browser.zoom.", this, true);

		//When the default browser confirmation dialog is showwn on startup, Site specific zoom does not be allpied.
		//So, Force apply for the first tab
		if (gBrowser.mTabs.length == 1) {
			this.onLocationChange(gBrowser.currentURI, true, gBrowser.selectedBrowser);
		}
	},

	destroy : function FullZoom_destroy() {
		let os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		try {
			os.removeObserver(this, "private-browsing");
		} catch (e) {}
		this._prefBranch.removeObserver("browser.zoom.", this);
		//                this._prefBranch.removeObserver("extensions.browser.zoom.", this);
		this._cps.removeObserver(this.name, this);
		this._cps.removeObserver(this.mode, this);
		window.removeEventListener("DOMMouseScroll", this, false);

		delete this._cps;
	},

	//**************************************************************************//
	// Event Handlers

	// nsIDOMEventListener

	handleEvent : function FullZoom_handleEvent(event) {
		switch (event.type) {
		case "DOMMouseScroll":
			this._handleMouseScrolled(event);
			break;
		}
	},

	_handleMouseScrolled : function FullZoom__handleMouseScrolled(event) {
		// Construct the "mousewheel action" pref key corresponding to this event.
		// Based on nsEventStateManager::GetBasePrefKeyForMouseWheel.
		var pref = "mousewheel";
		if (typeof MOUSE_SCROLL_IS_HORIZONTAL != 'undefined') { //3.0.*
			if (event.scrollFlags & MOUSE_SCROLL_IS_HORIZONTAL)
				pref += ".horizscroll";
		} else { //Fx3.1.*
			if (event.axis == event.HORIZONTAL_AXIS)
				pref += ".horizscroll";
		}

		if (event.shiftKey)
			pref += ".withshiftkey";
		else if (event.ctrlKey)
			pref += ".withcontrolkey";
		else if (event.altKey)
			pref += ".withaltkey";
		else if (event.metaKey)
			pref += ".withmetakey";
		else
			pref += ".withnokey";

		pref += ".action";

		// Don't do anything if this isn't a "zoom" scroll event.
		var isZoomEvent = false;
		try {
			isZoomEvent = (gPrefService.getIntPref(pref) == MOUSE_SCROLL_ZOOM);
		} catch (e) {}
		if (!isZoomEvent)
			return;

		// XXX Lazily cache all the possible action prefs so we don't have to get
		// them anew from the pref service for every scroll event?  We'd have to
		// make sure to observe them so we can update the cache when they change.

		// We have to call _applySettingToPref in a timeout because we handle
		// the event before the event state manager has a chance to apply the zoom
		// during nsEventStateManager::PostHandleEvent.
		window.setTimeout(function (self) {
			self._applySettingToPref()
		}, 0, this);
	},

	// nsIObserver

	observe : function (aSubject, aTopic, aData) {
		switch (aTopic) {
		case "nsPref:changed":
			switch (aData) {
			case "browser.zoom.siteSpecific":
				this._siteSpecificPref = this._prefBranch.getBoolPref("browser.zoom.siteSpecific");
				break;
			case "browser.zoom.updateBackgroundTabs":
				this.updateBackgroundTabs = this._prefBranch.getBoolPref("browser.zoom.updateBackgroundTabs");
				break;
			case "browser.zoom.defaultZoomValue":
				this.globalValue = this._ensureValid(parseFloat(this._prefBranch.getCharPref("browser.zoom.defaultZoomValue")));
				break;
			}
			break;
		case "private-browsing":
			switch (aData) {
			case "enter":
				this._inPrivateBrowsing = true;
				break;
			case "exit":
				this._inPrivateBrowsing = false;
				break;
			}
			break;
		}
	},

	//Ensure local file url convert to aURI
	convURI : function (aURI) {
		const ioService = Components.classes['@mozilla.org/network/io-service;1'].getService(Components.interfaces.nsIIOService);
		if (!!aURI && !this.localFolderSpecific) {
			if (/^file:/i.test(aURI.spec)) {
				var tmp = aURI.spec.split('/');
				tmp.pop();
				var url = tmp.join('/');
				aURI = ioService.newURI(url, null, null)
			}
		}
		return aURI;
	},

	// nsIContentPrefObserver
	onContentPrefSet : function FullZoom_onContentPrefSet(aGroup, aName, aValue) {
		var url = this.convURI(gBrowser.currentURI);
		if (aGroup == this._cps.grouper.group(url))
			this._applyPrefToSetting(aName, aValue);
		else if (aGroup == null) {
			this.globalValue = this._ensureValid(aValue);

			// If the current page doesn't have a site-specific preference,
			// then its zoom should be set to the new global preference now that
			// the global preference has changed.
			if (!this._cps.hasPref(url, aName))
				this._applyPrefToSetting(aName);
		}
	},

	onContentPrefRemoved : function FullZoom_onContentPrefRemoved(aGroup, aName) {
		var url = this.convURI(gBrowser.currentURI);
		if (aGroup == this._cps.grouper.group(url))
			this._applyPrefToSetting(aName);
		else if (aGroup == null) {
			this.globalValue = undefined;

			// If the current page doesn't have a site-specific preference,
			// then its zoom should be set to the default preference now that
			// the global preference has changed.
			if (!this._cps.hasPref(url, aName))
				this._applyPrefToSetting(aName);
		}
	},

	/**
	 * Called when the location of a tab changes.
	 * When that happens, we need to update the current zoom level if appropriate.
	 *
	 * @param aURI
	 *        A URI object representing the new location.
	 * @param aIsTabSwitch
	 *        Whether this location change has happened because of a tab switch.
	 * @param aBrowser
	 *        (optional) browser object displaying the document
	 */
	onLocationChange : function FullZoom_onLocationChange(aURI, aIsTabSwitch, aBrowser) {
		if (!aURI || (aIsTabSwitch && !this.siteSpecific))
			return;

		var aBrowser = aBrowser || gBrowser.selectedBrowser;
		aURI = this.convURI(aURI);

		if (this.ignoreImageDocument && aBrowser.contentDocument instanceof Ci.nsIImageDocument) {
			ZoomManager.setZoomForBrowser(aBrowser, 1.0);
		} else {
			if (!this.siteSpecific) {
				if (this.isAlreadyApplied(aBrowser)) {
					//Get saved zoomlevel for Tab and applied, if siteSpecific is false.
					var useFullAuto = this.getApplied(aBrowser);
					var index = gBrowser.getBrowserIndexForDocument(aBrowser.contentDocument);
					var aTab = gBrowser.mTabs[index];
					var SavedURL = aTab.getAttribute("FullZoomAutoSavedURL");
					//fullZoomBtn.debug("SavedURL " + SavedURL + "\nlChange URI.spec " + aURI.spec);
					if (this.globalAuto && useFullAuto && SavedURL != aURI.spec) {
						if (aBrowser == gBrowser.selectedBrowser)
							fullZoomBtn.doFullZoomBy(-1, true);
					}
				} else {
					//set default zoomlevel for Tab, if siteSpecific is false.
					var useFullZoom = this.globalMode;
					ZoomManager.useFullZoom = useFullZoom;
					ZoomManager.setZoomForBrowser(aBrowser, this.globalValue);
					ZoomManager.useFullZoom = useFullZoom;
					ZoomManager.useFullAuto = false;
					//Save zoomlevel for Tab, if siteSpecific is false.
					this.setApplied(aBrowser);
				}
			} else {
				// Avoid the cps roundtrip and apply the default/global pref.
				if (aURI.spec == "about:blank") {
					this._applyPrefToSetting(this.mode, undefined, aBrowser);
					this._applyPrefToSetting(this.name, undefined, aBrowser);
					this._applyPrefToSetting(this.auto, undefined, aBrowser);
					return;
				}

				this._applyPrefToSetting(this.mode, this._cps.getPref(aURI, this.mode), aBrowser);
				this._applyPrefToSetting(this.name, this._cps.getPref(aURI, this.name), aBrowser);
				this._applyPrefToSetting(this.auto, this._cps.getPref(aURI, this.auto), aBrowser);

				/*
				/// Bug 541779 -  Make site-specific zoom check asynchronous
				var self = this;
				this._cps.getPref(aURI, this.mode, function(aResult) {
				// Check that we're still where we expect to be in case this took a while.
				let isSaneURI = (aBrowser && aBrowser.currentURI) ?
				aURI.equals(aBrowser.currentURI) : false;
				if (!aBrowser || isSaneURI)
				self._applyPrefToSetting(self.mode, aResult, aBrowser);
				});
				this._cps.getPref(aURI, this.name, function(aResult) {
				// Check that we're still where we expect to be in case this took a while.
				let isSaneURI = (aBrowser && aBrowser.currentURI) ?
				aURI.equals(aBrowser.currentURI) : false;
				if (!aBrowser || isSaneURI)
				self._applyPrefToSetting(self.name, aResult, aBrowser);
				});
				this._cps.getPref(aURI, this.auto, function(aResult) {
				// Check that we're still where we expect to be in case this took a while.
				let isSaneURI = (aBrowser && aBrowser.currentURI) ?
				aURI.equals(aBrowser.currentURI) : false;
				if (!aBrowser || isSaneURI)
				self._applyPrefToSetting(self.auto, aResult, aBrowser);
				});
				 */
				if (this.globalAuto && ZoomManager.useFullAuto)
					if (aBrowser == gBrowser.selectedBrowser && (typeof gBrowser.selectedBrowser.FullZoomAutoSavedURL == 'undefined' || gBrowser.selectedBrowser.FullZoomAutoSavedURL != aURI.spec)) {
						fullZoomBtn.doFullZoomBy(-1, true);
						gBrowser.selectedBrowser.FullZoomAutoSavedURL = aURI.spec;
					}
			}
		}
		if (aBrowser == gBrowser.selectedBrowser) {
			fullZoomBtn.showZoomLevelInStatusbar();
			//alert("onLocationChange" + (ZoomManager.useFullZoom?"F":"T") + ZoomManager.zoom*100);
		}
	},

	//When not Site Specific Mode, Does already applied zooming facor for aBrowser or not.
	isAlreadyApplied : function FullZoom_isAlreadyApplied(aBrowser) {
		var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].getService(Components.interfaces.nsISessionStore);

		var browser = aBrowser || gBrowser.selectedBrowser;
		var index = gBrowser.getBrowserIndexForDocument(browser.contentDocument);
		var aTab = gBrowser.mTabs[index];

		try {
			if (!!ss.getTabValue(aTab, "FullZoomMode")) {
				return true;
			}
		} catch (ex) {
			return aTab.hasAttribute("FullZoomMode");
		}
	},

	//When not Site Specific Mode, Get ZoomLevel for curennt aBrowser
	getApplied : function FullZoom_getApplied(aBrowser) {
		var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].getService(Components.interfaces.nsISessionStore);

		var browser = aBrowser || gBrowser.selectedBrowser;
		var index = gBrowser.getBrowserIndexForDocument(browser.contentDocument);
		var aTab = gBrowser.mTabs[index];

        var value, useFullZoom, useFullAuto;
		try {
			value = ss.getTabValue(aTab, "FullZoomLevel");
			useFullZoom = ss.getTabValue(aTab, "FullZoomMode") == 'true';
			useFullAuto = ss.getTabValue(aTab, "FullZoomAuto") == 'true';
		} catch (ex) {
			value = aTab.getAttribute("FullZoomLevel");
			useFullZoom = aTab.getAttribute("FullZoomMode") == 'true';
			useFullAuto = aTab.getAttribute("FullZoomAuto") == 'true';
		}
		ZoomManager.useFullZoom = useFullZoom;
		if (value)
			ZoomManager.setZoomForBrowser(browser, this._ensureValid(value));
		else
			ZoomManager.setZoomForBrowser(browser, this.globalValue);
		ZoomManager.useFullZoom = useFullZoom;
		ZoomManager.useFullAuto = useFullAuto;
		return useFullAuto;
	},

	//When not Site Specific Mode, Save ZoomLevel for curennt aBrowser
	setApplied : function FullZoom_setApplied(aBrowser) {
		var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].getService(Components.interfaces.nsISessionStore);

		var browser = aBrowser || gBrowser.selectedBrowser;
		var index = gBrowser.getBrowserIndexForDocument(browser.contentDocument);
		var aTab = gBrowser.mTabs[index];

		try {
			ss.setTabValue(aTab, "FullZoomLevel", ZoomManager.getZoomForBrowser(browser));
			ss.setTabValue(aTab, "FullZoomMode", !!ZoomManager.useFullZoom);
			ss.setTabValue(aTab, "FullZoomAuto", !!ZoomManager.useFullAuto);
		} catch (ex) {}
		aTab.setAttribute("FullZoomLevel", ZoomManager.getZoomForBrowser(browser));
		aTab.setAttribute("FullZoomMode", !!ZoomManager.useFullZoom);
		aTab.setAttribute("FullZoomAuto", !!ZoomManager.useFullAuto);
		aTab.setAttribute("FullZoomAutoSavedURL", browser.currentURI.spec);
	},

	//When not Site Specific Mode, Remove ZoomLevel for curennt aBrowser
	removeApplied : function FullZoom_removeApplied() {
		var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].getService(Components.interfaces.nsISessionStore);
		var aTab = gBrowser.mCurrentTab;
		try {
			ss.deleteTabValue(aTab, "FullZoomLevel");
			ss.deleteTabValue(aTab, "FullZoomMode");
			ss.deleteTabValue(aTab, "FullZoomAuto");
			ss.deleteTabValue(aTab, "FullZoomAutoSavedURL");
		} catch (ex) {}
		aTab.removeAttribute("FullZoomLevel");
		aTab.removeAttribute("FullZoomMode");
		aTab.removeAttribute("FullZoomAuto");
		aTab.removeAttribute("FullZoomAutoSavedURL");
	},

	// update state of zoom type menu item
	updateMenu : function FullZoom_updateMenu() {
		var menuItem = document.getElementById("toggle_zoom");

		menuItem.setAttribute("checked", !ZoomManager.useFullZoom);
	},

	//**************************************************************************//
	// Setting & Pref Manipulation

	reduce : function FullZoom_reduce() {
		ZoomManager.reduce();
		this._applySettingToPref();
	},

	enlarge : function FullZoom_enlarge() {
		ZoomManager.enlarge();
		this._applySettingToPref();
	},

	toggleZoom : function FullZoom_enlarge() {
		ZoomManager.toggleZoom();
		this._applySettingToPref();
	},

	resetZoom : function FullZoom_enlarge() {
		ZoomManager.reset();
		this._applySettingToPref();
	},

	reset : function FullZoom_reset() {
		if (typeof this.globalValue != "undefined")
			ZoomManager.zoom = this.globalValue;
		else
			ZoomManager.reset();

		if (!(this.ignoreImageDocument && content.document instanceof Ci.nsIImageDocument)) {
			this._removePref();

			//Remove saved zoomlevel for Tab
			this.removeApplied();
		}
	},

	setSettingValue : function FullZoom_setSettingValue(aBrowser) {
		var browser = aBrowser || gBrowser.selectedBrowser;
		var uri = this.convURI(browser.currentURI);

		var value = this._cps.getPref(uri, this.name);
		this._applyPrefToSetting(this.name, value, browser);

		value = this._cps.getPref(uri, this.mode);
		this._applyPrefToSetting(this.mode, value, browser);
	},

	/**
	 * Set the zoom level for the current tab.
	 *
	 * Per nsPresContext::setFullZoom, we can set the zoom to its current value
	 * without significant impact on performance, as the setting is only applied
	 * if it differs from the current setting.  In fact getting the zoom and then
	 * checking ourselves if it differs costs more.
	 *
	 * And perhaps we should always set the zoom even if it was more expensive,
	 * since DocumentViewerImpl::SetTextZoom claims that child documents can have
	 * a different text zoom (although it would be unusual), and it implies that
	 * those child text zooms should get updated when the parent zoom gets set,
	 * and perhaps the same is true for full zoom
	 * (although DocumentViewerImpl::SetFullZoom doesn't mention it).
	 *
	 * So when we apply new zoom values to the browser, we simply set the zoom.
	 * We don't check first to see if the new value is the same as the current
	 * one.
	 **/
	_applyPrefToSetting : function FullZoom__applyPrefToSetting(aName, aValue, aBrowser) {
		var browser = aBrowser || gBrowser.selectedBrowser;

		var resetZoom = (gInPrintPreviewMode || browser.contentDocument instanceof Ci.nsIImageDocument);

		if (aName == this.name) {
			try {
				if (resetZoom)
					ZoomManager.setZoomForBrowser(browser, this.globalValue);
				else if (typeof aValue != "undefined")
					ZoomManager.setZoomForBrowser(browser, this._ensureValid(aValue));
				else
					ZoomManager.setZoomForBrowser(browser, this.globalValue);
			} catch (ex) {}
		} else if (aName == this.mode) {
			try {
				if (resetZoom)
					ZoomManager.useFullZoom = this.globalMode;
				else if (typeof aValue != "undefined")
					ZoomManager.useFullZoom = !!aValue;
				else
					ZoomManager.useFullZoom = this.globalMode;
			} catch (ex) {}
		} else if (aName == this.auto) {
			try {
				if (resetZoom)
					ZoomManager.useFullAuto = false;
				else if (typeof aValue != "undefined")
					ZoomManager.useFullAuto = !!aValue;
				else
					ZoomManager.useFullAuto = false;
			} catch (ex) {}
		}
		if (browser == gBrowser.selectedBrowser)
			fullZoomBtn.showZoomLevelInStatusbar();
	},

	_applySettingToPref : function FullZoom__applySettingToPref(aBrowser) {
		if (gInPrintPreviewMode)
			return;

		var browser = aBrowser || gBrowser.selectedBrowser;
		var url = this.convURI(browser.currentURI);

		if (!(this.ignoreImageDocument && browser.contentDocument instanceof Ci.nsIImageDocument)) {
			if (!this.siteSpecific) {
				//Save zoomlevel for Tab
				this.setApplied(browser);
			} else {
				if (Math.floor(ZoomManager.getZoomForBrowser(browser) * 100) != Math.floor(this.globalValue * 100)) {
					this._cps.setPref(url, this.name, ZoomManager.getZoomForBrowser(browser));
				} else {
					this._removePrefZoom(url);
				}
				if (ZoomManager.useFullZoom != this.globalMode) {
					this._cps.setPref(url, this.mode, ZoomManager.useFullZoom);
				} else {
					this._removePrefMode(url);
				}
				if (!!ZoomManager.useFullAuto) {
					this._cps.setPref(url, this.auto, ZoomManager.useFullAuto);
				} else {
					this._removePrefAuto(url);
				}
			}
		}

		if (browser == gBrowser.selectedBrowser)
			fullZoomBtn.showZoomLevelInStatusbar();
	},

	_removePref : function FullZoom_removePref(url) {
		if (!url)
			url = this.convURI(gBrowser.currentURI);
		this._cps.removePref(url, this.mode);
		this._cps.removePref(url, this.name);
		this._cps.removePref(url, this.auto);
	},

	_removePrefZoom : function FullZoom_removePrefZoom(url) {
		if (!url)
			url = this.convURI(gBrowser.currentURI);
		this._cps.removePref(url, this.name);
	},

	_removePrefMode : function FullZoom_removePrefMode(url) {
		if (!url)
			url = this.convURI(gBrowser.currentURI);
		this._cps.removePref(url, this.mode);
	},

	_removePrefAuto : function FullZoom_removePrefAuto(url) {
		if (!url)
			url = this.convURI(gBrowser.currentURI);
		this._cps.removePref(url, this.auto);
	},

	//**************************************************************************//
	// Utilities

	_ensureValid : function FullZoom__ensureValid(aValue) {
		if (isNaN(aValue))
			return this.globalValue;

		if (aValue < ZoomManager.MIN)
			return ZoomManager.MIN;

		if (aValue > ZoomManager.MAX)
			return ZoomManager.MAX;

		return aValue;
	}
};
var fullZoomBtn = {
	full : null,
	win : null,
	windowResizedTimer : null,
	//init
	init : function () {
		window.removeEventListener('DOMContentLoaded', this, false);
		window.addEventListener('unload', this, false);
		document.getElementById("appcontent").addEventListener("resize", this, false);

		fullZoomBtn.lastInnerWidth = fullZoomBtn.calculateWidth();
		//fullZoomBtn.showZoomLevelInStatusbar(ZoomManager.zoom, ZoomManager.useFullZoom);

		// Bug 505312 -  After detach tab,The zoom level of the detached tab does not
		// synchronize until it reloads.(In the detached tab, onLocationChange does not
		// fire by switching tab until it reload.)
		var isFx35 = parseInt(Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo).version.substr(0, 3) * 10, 10) / 10 > 3.0;
		if (isFx35)
			gBrowser.tabContainer.addEventListener('TabSelect', this, false);
	},

	uninit : function () {
		window.removeEventListener('unload', this, false);
		document.getElementById("appcontent").removeEventListener("resize", this, false);
		gBrowser.tabContainer.removeEventListener('TabSelect', this, false);
	},

	handleEvent : function (event) {
		switch (event.type) {
		case 'TabSelect':
			this.tabSelect(event);
			break;
		case 'resize':
			this.windowResized(event);
			break;
		/*case 'DOMContentLoaded':
			setTimeout(function(){
				this.init(event);
				}, 1000);
			
			break;*/
		case 'unload':
			this.uninit(event);
		}
	},

	tabSelect : function (event) {
		FullZoom.onLocationChange(event.target.linkedBrowser.currentURI, true, event.target.linkedBrowser);
	},

	//show Zoom Level In Statusbar
	showZoomLevelInStatusbar : function () {
		var statusbarZoomLevel = document.getElementById("statusbarZoomLevel");
		if (!statusbarZoomLevel)
			return;
		var label = Math.floor(ZoomManager.zoom * 100 + 0.5);
		
		if (FullZoomConfig.showIconBtn){
			if (ZoomManager.useFullZoom) {
				src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAItSURBVDhPlZBPTJJhHMffOQ+tQ4cOXW2NteahjXHzwuaJA6fWBgdWJ6st45A6VhAuy4wGCQN0lthQlEkmhGERjEwCnJo2Xhy4JeLMaUj+iRoyfPn2Ml73+qpz+dl+e/Y8z+/zPXyJ/fS/811wf/qqGvk8M2gfDQ2ael0qRXP7eeb7eN4HZ1X+SCL/IRyHJxjHsD+KnuEgnpgG8vVKnYpeqShvHoF7bFrtm4hjZj6D5BqFVLqIBfqMpXbQNxrDfZ0NNxVtamadywu756JzbLYQS27RIrCcAZbWmaHviR+76HgTRaPGUrhyvf4So7FYnYFHnvEoVjbK0sIaG7AXNh7LoaXTjRtNbRpGYzH1e94GJhJIb7Piwfm2WITRHoL8QbuX0VgeGgZGPn6JYuvP0XJpyCXA4pxCU6vJRyvcMhsed2hsrgD+7gC5PFfM/KZPuoe55SJ6nBEoWo1mRmO5Jm++fO+5lVpNb4CigMIuNyD5E5hMbOPlaz8lq7tTw2hc5Gq9Qds9hPVfmygWgXwByOaA1U0gtpiFwzuFp+Y+D71aWTYOIBQKK28rtWalvpdy+cKYJr9jkkzBR5fr8IapxhYj2Wl1Fa5KJE6ZTHaO0Q5RIam7W6N81tWl6x4KGW3uiN7isNxqUNYSVVWnLK+sK1KpFGKxmDwuZI9S05y2aanWYDBkTxJyiP0hIpGIFAgEp5mv/6cUotVqs3Rvczwe7wzzfDL4fD6vurr6LEEQxD/MoaXb0IcUsQAAAABJRU5ErkJggg==";
				tooltiptext = "FullZoom: " + label + "%";
			} else {
				src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAJzSURBVDhPlZBdTJJRHMaZ86J10UUX3doaa82LNsedNzAvmmtubbUmF6xusloZLT+yCeHUzChAiw/DxEIxFU0UQzOITERJTYuPQZuKZs5CEokKGb48vejbkGwuf9vZ2Tnn/3vevQ9tKy3PjYf0r9/xe99Mtrf1WdtlTd38krKag9TzzvRbpvimt57IixE3DBY3ukx2NHZZcFvRFsnnifnkSMrm5D/QD04IjDY3Jj/6MfuFwJwvhhlyd86tobnPiVKxBhdKqgXUeDL1rYbDPYNTUefsKikCC35AYwyixRTAPHn2fF6H4pkd14Wq6Mmz+UcoLYFaZ640DNmxuALML4P8MlCk+IRSpXcjLH435Ayjok6P88XVQkpLIGsx9JhtHviCQJs5iMonizh14wNOFNpwTTyJ+q4ZvPfGIG21giuoGaC0BOUPnva+HLZj9Qeg7vejWDaN41dHcOzSK5wrt+BekwuOeUClG0dxldxIKsllFt5SCDXdZvxcA8IR4Be5uMIxFIhs8H8nf4HswbUQQ6NuFCVVUjmlJTjDLTvKk6iJJd8KCAKIrgMPtS4oO1wbAbNfgTFPEI86TAQn70ompSXDFdTeFzV0YvlbALEYEIkCoTCwFACc3hC0A+O4I282kKOpm8ZfMJnM1Ms8kfxmbRPRbRzBhGMaY445GMlytQM2oqhC6qhr1kdP57J1HA7nAKVtIyU3ryCTd1epFDd0WmUa/WitSqu6WMjLoqWl7VE9Vi+y2Wzk5OQ4dgr5Q7zppLZJKUsqlYZ2E7KNrSHZ2dkOBoOxl3r6f+IhEokkxGKxXHQ6fR91vTsyMjLo6enp+2k0Gu03BsOUvNQISWAAAAAASUVORK5CYII=";
				tooltiptext = "TextZoom: " + label + "%";
			}
			statusbarZoomLevel.setAttribute("tooltiptext", tooltiptext);
			statusbarZoomLevel.setAttribute("class", "statusbarpanel-iconic");
			statusbarZoomLevel.setAttribute("image", src);
		} else {
			if (ZoomManager.useFullZoom)
				label = "F" + label + "%";
			else
				label = "T" + label + "%";
			statusbarZoomLevel.setAttribute("label", label);
			statusbarZoomLevel.setAttribute("tooltiptext", "左键：切换缩放模式\n右键：设置缩放倍数");
		}
	},

	clickStatusLabel : function (evt) {
		if (evt.type == "DOMMouseScroll") {
			this.click(evt, ZoomManager.useFullZoom);
			return;
        }
        if (evt.button == 0/* || evt.button == 0 && evt.clientX- evt.target.boxObject.x  < 12*/) {
            evt.stopPropagation();
			evt.preventDefault();
			//トグルモード
			document.getElementById("cmd_fullZoomToggle").doCommand();
			return;
		}
		if (evt.button == 1) {
			// 標準サイズ
			document.getElementById("cmd_fullZoomReset").doCommand();
			return;
		}
		var btn = evt.target;
		this.full = ZoomManager.useFullZoom;
		var popup = document.getElementById("fullZoomBtn_popup");
		//toggle
		if (popup.status == "open") {
			popup.hidePopup();
			// workaround Bug 622507
			popup.removeAttribute("height");
			popup.removeAttribute("width");
		} else {
			// workaround Bug 622507
			popup.removeAttribute("height");
			popup.removeAttribute("width");
			popup.openPopup(btn);
		}
	},

	click : function (evt, fullZoom) {
		if (!!document.getElementById("textZoomBtn_popup2") && document.getElementById("textZoomBtn_popup2").state == "open") {
			return;
		}
		if (!!document.getElementById("fullZoomBtn_popup2") && document.getElementById("fullZoomBtn_popup2").state == "open") {
			return;
		}
		if (evt.type == "DOMMouseScroll") {
			if (evt.detail > 0) {
				// ページ縮小
				this.toggleZoom(fullZoom);
				document.getElementById("cmd_fullZoomReduce").doCommand();
			} else {
				// ページ拡大
				this.toggleZoom(fullZoom);
				document.getElementById("cmd_fullZoomEnlarge").doCommand();
			}
			return;
		}

		if (evt.button == 0 && evt.shiftKey) {
			evt.stopPropagation();
			var btn = evt.target;
			if (document.getElementById("fullzoombtn") == btn || document.getElementById("fullzoombtn2") == btn)
				this.full = true;
			else if (document.getElementById("textzoombtn") == btn || document.getElementById("textzoombtn2") == btn)
				this.full = false;
			var popup = document.getElementById("fullZoomBtn_popup");
			// workaround Bug 622507
			popup.removeAttribute("height");
			popup.removeAttribute("width");
			popup.openPopup(btn, "after_end");
		} else if (evt.button == 2 && evt.shiftKey) {
			this.openPrefWindow();
		} else {
			this.zoom(evt.button, fullZoom)
		}
		evt.preventDefault();
		evt.stopPropagation();
		return false;
	},

	zoom : function (type, fullZoom) {
		//AutoFit to Flase
		ZoomManager.useFullAuto = false;
		switch (type) {
		case 0:
			// ページ拡大
			this.toggleZoom(fullZoom);
			document.getElementById("cmd_fullZoomEnlarge").doCommand();
			break;
		case 1: // Middle Click
			// 標準サイズ
			this.toggleZoom(fullZoom);
			document.getElementById("cmd_fullZoomReset").doCommand();
			fullZoomBtn.showZoomLevelInStatusbar();
			break;
		case 2: // Right Click
			// ページ縮小
			this.toggleZoom(fullZoom);
			document.getElementById("cmd_fullZoomReduce").doCommand();
			break;
		}
	},

	toggleZoom : function ZoomManager_toggleZoom(useFullZoom) {
		var zoomLevel = ZoomManager.zoom;
		ZoomManager.useFullZoom = useFullZoom;
		ZoomManager.zoom = zoomLevel;
	},

	//option
	openPrefWindow : function () {
		window.openDialog("chrome://DefaultFullZoomLevel/content/pref.xul", "DefaultFullZoomLevel:Setting", "chrome,titlebar,toolbar,centerscreen,modal");
	},

	windowResized : function (event) {
		if (this.windowResizedTimer) {
			clearTimeout(this.windowResizedTimer);
			this.windowResizedTimer = null;
		}
		this.windowResizedTimer = setTimeout(function (self) {
				var width = self.calculateWidth();
				var diff = width - self.lastInnerWidth;
				if (Math.abs(diff) < 5)
					return;
				self.lastInnerWidth = width;
				if (FullZoom.globalAuto && !!ZoomManager.useFullAuto) {
					self.doFullZoomBy(-1, true);
				}
			}, 500, this);
	},

	calculateWidth : function () {
		//Reserve Sidebar Width
		var reservesidebar = FullZoomConfig.reserveSidebarWidth;
		var sidebarWidth = 0;
		var sidebarsplitterWidth = 0;
		var sidebarbox = document.getElementById("sidebar-box");
		var sidebar = document.getElementById("sidebar");

		if (reservesidebar && sidebarbox.boxObject.width == 0) {

			sidebarWidth = Math.ceil(sidebarbox.width);
			if (!sidebarWidth)
				sidebarWidth = Math.ceil(document.defaultView.getComputedStyle(sidebar, '').getPropertyValue('width').replace('px', ''));

			var sidebarsplitter = document.getElementById("sidebar-splitter");
			if (sidebarsplitter.boxObject.width == 0)
				sidebarsplitterWidth = Math.ceil(document.defaultView.getComputedStyle(sidebarsplitter, '').getPropertyValue('min-width').replace('px', ''));

			sidebarWidth = sidebarWidth + sidebarsplitterWidth;
		}
		//window width
		//this.debug("content W= " + gBrowser.mPanelContainer.boxObject.width);
		//this.debug("sidebar W= " + sidebarWidth);
		return gBrowser.mPanelContainer.boxObject.width - sidebarWidth;
	},

	//calculate zoom level for fit to window.
	getFitZoomLevel : function (useFullZoom, aBrowser, forceFit) {
		var doc = aBrowser.contentDocument;
		if (!doc.documentElement)
			return;
		//min max
		var minzoom = (FullZoomConfig.minimum / 100);
		var maxzoom = (FullZoomConfig.maximum / 100);

		ZoomManager.preserveTextSize = FullZoomConfig.fitToWidthPreserveTextSize;
		ZoomManager.useFullZoom = useFullZoom;

		//display width (include/exclude sidebar width)
		var width = this.calculateWidth();

		//scrollbar width
		var scw = Math.ceil((doc.defaultView.innerWidth - doc.documentElement.offsetWidth) * ZoomManager.getZoomForBrowser(aBrowser)); ////ZoomManager.getZoom2(aTab) );
		//this.debug("scroll W= " + scw);
		//display width exclude scrollbar width
		var ww = width - scw;

		//content width
		var hw = doc.documentElement.scrollWidth;
		var dw = (doc.body) ? doc.body.scrollWidth : hw;
		if (!(FullZoom.forceFitToWidth || forceFit) || ww > Math.max(hw, dw)) {
			changeZoom();
		} else {
			ZoomManager.setZoomForBrowser(aBrowser, (FullZoom.forceFitToWidth || forceFit) ? maxzoom : FullZoom.globalValue);
			setTimeout(function () {
				changeZoom();
			}, 0);
		}

		function changeZoom() {
			//content width
			var hw = doc.documentElement.scrollWidth;
			var dw = (doc.body) ? doc.body.scrollWidth : hw;
			var error = (FullZoom.forceFitToWidth || forceFit) ? 1.03 : 1;
			var zoom = Math.floor(Math.floor((ww / (Math.max(hw, dw) * error)) * 20) * 5) / 100;
			zoom = Math.min(Math.max(zoom, minzoom), maxzoom);
			ZoomManager.useFullAuto = true;
			ZoomManager.useFullZoom = useFullZoom;
			ZoomManager.setZoomForBrowser(aBrowser, zoom);

			FullZoom._applySettingToPref();
		}
	},

	//Apply zoom level to current tab
	doFullZoomBy : function (zoom, useFullZoom, aBrowser, forceFit) {
		var browser = aBrowser || gBrowser.selectedBrowser;
		var ss = Components.classes["@mozilla.org/browser/sessionstore;1"].getService(Components.interfaces.nsISessionStore);
		if (zoom < 0) {
			fullZoomBtn.getFitZoomLevel(useFullZoom, browser, forceFit);
			return;
		}

		ZoomManager.useFullAuto = false;
		ZoomManager.useFullZoom = useFullZoom;
		ZoomManager.setZoomForBrowser(browser, zoom);

		FullZoom._applySettingToPref();
	},

	SetFullZoom : function (event, zoom, useFullZoom) {
		if (event.button == 0)
			fullZoomBtn.doFullZoomBy(zoom, useFullZoom);
		else if (event.button == 2 ) {
			FullZoom._prefBranch.setCharPref("browser.zoom.defaultZoomValue", zoom);
			var alertsService = Components.classes["@mozilla.org/alerts-service;1"].getService(Components.interfaces.nsIAlertsService);
			alertsService.showAlertNotification("chrome://global/skin/icons/information-32.png", "DefaultFullZoomLevel", "已设置所有页面默认值缩放值为" + zoom * 100 + "%", false, "", null, "");
		}
	},

	//create popup menu
	onPopupShowing : function (event, useFullZoom) {
		//sort関数
		function cmp_val(a, b) {
			var aa = Math.floor(a);
			var bb = Math.floor(b);
			return aa > bb ? -1 : 1;
		}

		var popup = event.target;
		while (popup.lastChild) {
			popup.removeChild(popup.lastChild);
		}

		if (typeof useFullZoom == 'undefined') {
			useFullZoom = this.full;
		}
		var p = FullZoomConfig.zoomValues;
		var s = p.split(',');
		s.sort(cmp_val);

		var arr = [];
		var zoom = Math.floor(ZoomManager.zoom * 100 + 0.5);
		for (var i = 0; i < s.length; i++) {
			try {
				var x = Math.floor(s[i] * 100 + 0.5);
				if (x < zoom) {
					arr.push(zoom);
					zoom = 0;
				} else if (x == zoom) {
					zoom = 0;
				}
				arr.push(x);
			} catch (ex) {}
		}
		if (zoom != 0) {
			arr.push(zoom);
		}
		for (var i = 0; i < arr.length; i++) {
			var menuitem = document.createElement('menuitem');
			var s = '    ' + (arr[i]).toString();
			menuitem.setAttribute('label', s.substr(s.length - 4, 4) + '%');
			menuitem.setAttribute('type', 'radio');
			//menuitem.setAttribute('oncommand', 'fullZoomBtn.doFullZoomBy(' + arr[i] / 100 + ', ' + useFullZoom + ');');
			menuitem.setAttribute('onclick', 'fullZoomBtn.SetFullZoom(event, ' + arr[i] / 100 + ', ' + useFullZoom + ');');
			menuitem.setAttribute('tooltiptext',"左键：设置当前页面缩放率\m右键：设置全局默认缩放率");
			if (!ZoomManager.useFullZoom == !useFullZoom && arr[i] == Math.floor(ZoomManager.zoom * 100 + 0.5)) {
				menuitem.setAttribute('checked', true);
			}

			popup.appendChild(menuitem);
		}
		var bundle = document.getElementById("bundle_defaultfullzoomlevel");
		if (useFullZoom) {
			var menuitem = document.createElement('menuseparator');
			popup.appendChild(menuitem);

			var menuitem = document.createElement('menuitem');
			menuitem.setAttribute('label', FullZoomConfig.fitToWindow);
			menuitem.setAttribute('oncommand', 'fullZoomBtn.doFullZoomBy( -1, ' + useFullZoom + ', null, true);');
			menuitem.setAttribute('type', 'checkbox');

			if (FullZoom.globalAuto && !!ZoomManager.useFullAuto) {
				menuitem.setAttribute('checked', true);
			}
			popup.appendChild(menuitem);
		}
		var menuitem = document.createElement('menuseparator');
		popup.appendChild(menuitem);

		var menuitem = document.createElement('menuitem');
		menuitem.setAttribute('label', FullZoomConfig.reset);
		var value = FullZoom.globalValue;
		menuitem.setAttribute('oncommand', 'fullZoomBtn.doFullZoomBy(' + value + ', ' + useFullZoom + ');');
		menuitem.setAttribute('type', 'checkbox');
		popup.appendChild(menuitem);
	},

	//prefを読み込み
	getPref : function (aPrefString, aPrefType, aDefault) {
		var xpPref = Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService);
		try {
			switch (aPrefType) {
			case 'complex':
				return xpPref.getComplexValue(aPrefString, Components.interfaces.nsILocalFile);
				break;
			case 'str':
				return xpPref.getCharPref(aPrefString).toString();
				break;
			case 'int':
				return xpPref.getIntPref(aPrefString);
				break;
			case 'bool':
			default:
				return xpPref.getBoolPref(aPrefString);
				break;
			}
		} catch (e) {}
		return aDefault;
	},
	//prefを書き込み
	setPref : function (aPrefString, aPrefType, aValue) {
		var xpPref = Components.classes['@mozilla.org/preferences;1'].getService(Components.interfaces.nsIPrefBranch2);
		try {
			switch (aPrefType) {
			case 'complex':
				return xpPref.setComplexValue(aPrefString, Components.interfaces.nsILocalFile, aValue);
				break;
			case 'str':
				return xpPref.setCharPref(aPrefString, aValue);
				break;
			case 'int':
				aValue = parseInt(aValue);
				return xpPref.setIntPref(aPrefString, aValue);
				break;
			case 'bool':
			default:
				return xpPref.setBoolPref(aPrefString, aValue);
				break;
			}
		} catch (e) {}
		return null;
	},

	debug : function (aMsg) {
		const Cc = Components.classes;
		const Ci = Components.interfaces;
		Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).logStringMessage(aMsg);
	},

	//Fxのバージョン
	getVer : function () {
		const Cc = Components.classes;
		const Ci = Components.interfaces;
		var info = Cc["@mozilla.org/xre/app-info;1"].getService(Ci.nsIXULAppInfo);
		var ver = parseInt(info.version.substr(0, 3) * 10, 10) / 10;
		return ver;
	}
};
var ZoomManager = {
	useFullAuto : false,
	preserveTextSize : false,

	get _prefBranch() {
		delete this._prefBranch;
		return this._prefBranch = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
	},

	get MIN() {
		delete this.MIN;
		return this.MIN = this._prefBranch.getIntPref("zoom.minPercent") / 100;
	},

	get MAX() {
		delete this.MAX;
		return this.MAX = this._prefBranch.getIntPref("zoom.maxPercent") / 100;
	},

	get useFullZoom() {
		return this._prefBranch.getBoolPref("browser.zoom.full");
	},

	set useFullZoom(aVal) {
		this._prefBranch.setBoolPref("browser.zoom.full", aVal);
		return aVal;
	},

	get zoom() {
		return this.getZoomForBrowser(getBrowser());
	},

	getZoomForBrowser : function ZoomManager_getZoomForBrowser(aBrowser) {
		var markupDocumentViewer = aBrowser.markupDocumentViewer;

		return this.useFullZoom ? markupDocumentViewer.fullZoom : markupDocumentViewer.textZoom;
	},

	getZoom2 : function ZoomManager_get_zoom(aBrowser) {
		var markupDocumentViewer = aBrowser.markupDocumentViewer;

		return this.useFullZoom ? markupDocumentViewer.fullZoom : markupDocumentViewer.textZoom;
	},

	set zoom(aVal) {
		this.setZoomForBrowser(getBrowser(), aVal);
		return aVal;
	},

	setZoomForBrowser : function ZoomManager_setZoomForBrowser(aBrowser, aVal) {
		if (aVal < this.MIN || aVal > this.MAX)
			throw Components.results.NS_ERROR_INVALID_ARG;

		var markupDocumentViewer = aBrowser.markupDocumentViewer;
		if (!markupDocumentViewer)
			return;

		if (this.useFullZoom) {
			if (this.preserveTextSize)
				markupDocumentViewer.textZoom = markupDocumentViewer.textZoom * markupDocumentViewer.fullZoom / aVal;
			else if (markupDocumentViewer.textZoom != 1)
				markupDocumentViewer.textZoom = 1;
			if (markupDocumentViewer.fullZoom != aVal)
				markupDocumentViewer.fullZoom = aVal;
		} else {
			if (markupDocumentViewer.textZoom != aVal)
				markupDocumentViewer.textZoom = aVal;
			if (markupDocumentViewer.fullZoom != 1)
				markupDocumentViewer.fullZoom = 1;
		}
	},

	zoom2 : function ZoomManager_set_zoom(aVal, aBrowser) { //aTab
		if (aVal < this.MIN || aVal > this.MAX)
			throw Components.results.NS_ERROR_INVALID_ARG;

		var markupDocumentViewer = aBrowser.markupDocumentViewer;
		if (!markupDocumentViewer)
			return;

		if (this.useFullZoom) {
            if (this.preserveTextSize)
                markupDocumentViewer.textZoom = markupDocumentViewer.textZoom * markupDocumentViewer.fullZoom / aVal; else if (markupDocumentViewer.textZoom != 1) markupDocumentViewer.textZoom = 1;
            if (markupDocumentViewer.fullZoom != aVal) markupDocumentViewer.fullZoom = aVal;
        } else {
            if (markupDocumentViewer.textZoom != aVal) markupDocumentViewer.textZoom = aVal;
            if (markupDocumentViewer.fullZoom != 1) markupDocumentViewer.fullZoom = 1;
        }

		return aVal;
	},

	get zoomValues() {
		var zoomValues = FullZoomConfig.zoomValues.split(",").map(parseFloat);
		zoomValues.sort(function (a, b)
			a - b);
			while (zoomValues[0] < this.MIN)
				zoomValues.shift();
			while (zoomValues[zoomValues.length - 1] > this.MAX)
				zoomValues.pop();

			delete this.zoomValues;
			return this.zoomValues = zoomValues;
	},

	enlarge : function ZoomManager_enlarge() {
		this.useFullAuto = false;
		var i = this.zoomValues.indexOf(this.snap(this.zoom)) + 1;
		if (i < this.zoomValues.length)
			this.zoom = this.zoomValues[i];
	},

	reduce : function ZoomManager_reduce() {
		this.useFullAuto = false;
		var i = this.zoomValues.indexOf(this.snap(this.zoom)) - 1;
		if (i >= 0)
			this.zoom = this.zoomValues[i];
	},

	reset : function ZoomManager_reset() {
		this.useFullAuto = false;
		this.zoom = FullZoom.globalValue;
	},

	toggleZoom : function ZoomManager_toggleZoom() {
		this.useFullAuto = false;
		var zoomLevel = this.zoom;

		this.useFullZoom = !this.useFullZoom;
		this.zoom = zoomLevel;
	},

	snap : function ZoomManager_snap(aVal) {
		var values = this.zoomValues;
		for (var i = 0; i < values.length; i++) {
			if (values[i] >= aVal) {
				if (i > 0 && aVal - values[i - 1] < values[i] - aVal)
					i--;
				return values[i];
			}
		}
		return values[i - 1];
	}
}

//ui
function fullZoomUI() {
	var statusbar = document.getElementById("urlbar-icons"); 
	//status-bar navigator-toolbox urlbar-icons  TabsToolbar
	var button = document.createElement("statusbarpanel");
	button.setAttribute("id", "statusbarZoomLevel");
	button.setAttribute("onmousedown", "fullZoomBtn.clickStatusLabel(event);");
	button.setAttribute("onclick", "event.preventDefault();");
	button.setAttribute("onDOMMouseScroll", "fullZoomBtn.clickStatusLabel(event);");
	//statusbar.appendChild(button);
	//statusbar.insertBefore(button, statusbar.childNodes[1]);
	statusbar.insertBefore(button, document.getElementById("star-button"));

	var popupSet = document.getElementById("mainPopupSet");
	var popup = document.createElement("menupopup");
	popup.setAttribute("id", "fullZoomBtn_popup");
	popup.setAttribute("ignorekeys", "true");
	popup.setAttribute("position", "event.preventDefault();");
	popup.setAttribute("onpopupshowing", "event.stopPropagation();\
				event.target.shown = true;\
		        if (event.target == this)\
			    fullZoomBtn.onPopupShowing(event)");
	popupSet.appendChild(popup);

}
fullZoomUI();

var delayloadFullZoom = function (aEvent) {
	setTimeout(function () {
		FullZoom.init();
		fullZoomBtn.init();
	}, 1000);
};
var loadFullZoom = function () {
	gBrowser.addEventListener("DOMContentLoaded", delayloadFullZoom, true);
};
window.addEventListener("pageshow", loadFullZoom, false);

