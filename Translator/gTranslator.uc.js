// ==UserScript==
// @name           gTranslator.uc.js
// @description    google_translator扩展的UC脚本版
// @author         Dannylee
// @namespace      lidanny2012@gmail.com
// @include        main
// @license        MIT License
// @compatibility  Firefox 4
// @charset        UTF-8
// @version        2.2 2013/04/09 02:00 REMOVE E4X
// @note           修改自用版 by defpt at 2013.07.30
// ==/UserScript==

var gTranslator = {
	_prefs : null,
	_targetlang : "zh-CN",
	_showpopuptext : true,
	_showoritext : false,
	_timer : null,

	onLoad : function () {
		this._prefs = Components.classes["@mozilla.org/preferences-service;1"]
			.getService(Components.interfaces.nsIPrefService)
			.getBranch("uc.gTranslator.");
		this._prefs.QueryInterface(Components.interfaces.nsIPrefBranch2);
		
		this._targetlang = navigator.language;
		if (!this._prefs.prefHasUserValue("targetlang")) {
			this._prefs.setCharPref("targetlang", this._targetlang);
		} else {
			this._targetlang = this._prefs.getCharPref("targetlang");
		}
		if (!this._prefs.prefHasUserValue("showpopuptext")) {
			this._prefs.setBoolPref("showpopuptext", this._showpopuptext);
		} else {
			this._showpopuptext = this._prefs.getBoolPref("showpopuptext");
		}
		if (!this._prefs.prefHasUserValue("showoritext")) {
			this._prefs.setBoolPref("showoritext", this._showoritext);
		} else {
			this._showoritext = this._prefs.getBoolPref("showoritext");
		}
		var overlay = '\
		<overlay xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" \
				xmlns:html="http://www.w3.org/1999/xhtml"> \
			<toolbar id="urlbar-icons">\
				<toolbarbutton id="statusbar-translator" label="翻译器" \
						context="statusbar-translator-contextmenu"\
					    onclick="if(event.button === 0) gTranslator.ToolBarTranslatorClick(event);" >\
					<menupopup id="statusbar-translator-contextmenu" \
                            onpopupshowing="gTranslator.showStatbarContextMenu(event);">\
						<menuitem id="translateselected-statusbar-translator" \
							label="翻译选定文本" \
							onclick="gTranslator.selectionTranslation(event);"/> \
						<menuitem id="translatepage-statusbar-translator" \
							label="翻译整个页面" \
							onclick="gTranslator.pageTranslation(event);"/> \
						<menuseparator/> \
						<menuitem label="翻译为简中" \
							id="trtid1" \
							type="checkbox" \
							value="zh-CN" \
							onclick = "gTranslator.settargetlang(event);" /> \
						<menuitem label="翻译为英文"  \
							id="trtid2" \
							type="checkbox" \
							value="en" \
							onclick = "gTranslator.settargetlang(event);" /> \
						<menuitem label="翻译为德文" \
							id="trtid3" \
							type="checkbox" \
							value="de" \
							onclick = "gTranslator.settargetlang(event);" /> \
						<menuseparator/> \
						<menuitem id="showsreplaced" \
							label="弹窗显示翻译结果" \
							tooltiptext = "选中弹窗翻译，否则替换原文" \
							type="checkbox" \
							value="' + this._showpopuptext + '" \
							onclick = "gTranslator.setshowmode(event);"/> \
						<menuitem id="showoritext" \
							label="对比显示翻译结果" \
							value="' + this._showoritext + '" \
							type="checkbox" \
							onclick = "gTranslator.setoridisplay(event);"/> \
					</menupopup>\
				</toolbarbutton>\
			</toolbar>\
			<popup id="contentAreaContextMenu">\
				<menuitem id="context-translator" label="Google 翻译选中文本" \
					insertAfter="context-searchselect" \
					class="menuitem-iconic" \
image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFCSURBVDhPnZExSwNBEEZPESStP8PKP2Fnr1hYiI2dkEoQJKWCnVXEIpDGQsRGJGKhFsKBHpEIFokJ4VQkpFMLm5E3OsvcmRBx4XG3e/u9md2LGB9vPfH0e+3A6/OD6KZhIx+u1Y5kb383I3h5uh8uIURgfaOoLC0vKjaHtNv4m8AHvWikAK7jCw0kjVgDq6UtWYslMH8pMnf2LjMnIlMHn4oK/IVZRTravumPFKjEC7hAaz0fPm+mCpKBgsfWbebshAy6sb/Bu4UL5VQiPnDuiWJT74EumFvLQGXbR6FfAsIGFwicFRBQ+TBOtDoC1girwIcNAiYghHDzNNEgAmRBwPBh5mMLx6FN+60EDdamKx2Z3Kl/C8ZXrjTMExCArzhbvVPoBAHPjCAfNhAQtJaBy4YgYAySsAF82NaMn/h/RxR9Ab4TXij6pKP0AAAAAElFTkSuQmCC" \
					oncommand="gTranslator.selectionTranslation(event);"/> \
				<menuitem id="context-page-translator" label="Google 翻译当前页面" \
					insertAfter="context-sep-viewsource" \
					class="menuitem-iconic" \
image="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFCSURBVDhPnZExSwNBEEZPESStP8PKP2Fnr1hYiI2dkEoQJKWCnVXEIpDGQsRGJGKhFsKBHpEIFokJ4VQkpFMLm5E3OsvcmRBx4XG3e/u9md2LGB9vPfH0e+3A6/OD6KZhIx+u1Y5kb383I3h5uh8uIURgfaOoLC0vKjaHtNv4m8AHvWikAK7jCw0kjVgDq6UtWYslMH8pMnf2LjMnIlMHn4oK/IVZRTravumPFKjEC7hAaz0fPm+mCpKBgsfWbebshAy6sb/Bu4UL5VQiPnDuiWJT74EumFvLQGXbR6FfAsIGFwicFRBQ+TBOtDoC1girwIcNAiYghHDzNNEgAmRBwPBh5mMLx6FN+60EDdamKx2Z3Kl/C8ZXrjTMExCArzhbvVPoBAHPjCAfNhAQtJaBy4YgYAySsAF82NaMn/h/RxR9Ab4TXij6pKP0AAAAAElFTkSuQmCC" \
					oncommand="gTranslator.pageTranslation(event);"/> \
			</popup>\
		</overlay>';
		overlay = "data:application/vnd.mozilla.xul+xml;charset=utf-8," + encodeURI(overlay);
		window.userChrome_js.loadOverlay(overlay, gTranslator);
		var css = '\
			#statusbar-translator {\
				list-style-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFCSURBVDhPnZExSwNBEEZPESStP8PKP2Fnr1hYiI2dkEoQJKWCnVXEIpDGQsRGJGKhFsKBHpEIFokJ4VQkpFMLm5E3OsvcmRBx4XG3e/u9md2LGB9vPfH0e+3A6/OD6KZhIx+u1Y5kb383I3h5uh8uIURgfaOoLC0vKjaHtNv4m8AHvWikAK7jCw0kjVgDq6UtWYslMH8pMnf2LjMnIlMHn4oK/IVZRTravumPFKjEC7hAaz0fPm+mCpKBgsfWbebshAy6sb/Bu4UL5VQiPnDuiWJT74EumFvLQGXbR6FfAsIGFwicFRBQ+TBOtDoC1girwIcNAiYghHDzNNEgAmRBwPBh5mMLx6FN+60EDdamKx2Z3Kl/C8ZXrjTMExCArzhbvVPoBAHPjCAfNhAQtJaBy4YgYAySsAF82NaMn/h/RxR9Ab4TXij6pKP0AAAAAElFTkSuQmCC");\
				-moz-appearance: none !important;\
				border-style: none !important;\
				border-radius: 0 !important;\
				padding: 0 2px !important;\
				margin: 0 !important;\
				background: transparent !important;\
				box-shadow: none !important;\
				-moz-box-align: center !important;\
				-moz-box-pack: center !important;\
				min-width: 18px !important;\
				min-height: 18px !important;\
			}\
				#statusbar-translator > .toolbarbutton-icon {\
				max-width: 18px !important;\
				padding: 0 !important;\
				margin: 0 !important;\
			}\
			#statusbar-translator dropmarker{display: none !important;}\
		'.replace(/[\r\n\t]/g, '');
        function addStyle(css) {
        	var pi = document.createProcessingInstruction(
        			'xml-stylesheet',
        			'type="text/css" href="data:text/css;utf-8,' + encodeURIComponent(css) + '"');
        	return document.insertBefore(pi, document.documentElement);
        }
		gTranslator.style = addStyle(css);

		var xmltt = '\
			        <tooltip id="translationResult"	style="-moz-appearance: none;display:-moz-popup;font:message-box;background-color:InfoBackground;color:InfoText;border: 1px solid InfoText;width:450px;">\
			      			<vbox id="translationResultPopupBox">\
			        			<label id="translationResultPopupLabel" flex="1" onclick="gTranslator.copyToClipboard(event,this.textContent);" tooltiptext="左键复制到剪切板、右键关闭！"/>\
			      			</vbox>\
			    		</tooltip>\
			    	';
		var rangett = document.createRange();
		rangett.selectNodeContents(document.getElementById('mainPopupSet'));
		rangett.collapse(false);
		rangett.insertNode(rangett.createContextualFragment(xmltt.replace(/\n|\r/g, ''))); //.replace(/\n/g, '')
		rangett.detach();

	},

	observe : function (aSubject, aTopic, aData) {
		if (aTopic == "xul-overlay-merged") {
			//	Application.console.log("GoogleTranslator界面加载完毕！");
			document.getElementById("contentAreaContextMenu").addEventListener("popupshowing", this.showContextMenu, false);
			window.addEventListener("unload", this, false);
		}
	},

	uninit : function () {
		if (this._timer)
			clearTimeout(this._timer);
		var i = document.getElementById("statusbar-translator");
		if (i)
			i.parentNode.removeChild(i);
		var i = document.getElementById("statusbar-translator-contextmenu");
		if (i)
			i.parentNode.removeChild(i);
		document.getElementById("contentAreaContextMenu").removeEventListener("popupshowing", this.showContextMenu, false);
		var i = document.getElementById("context-translator");
		if (i)
			i.parentNode.removeChild(i);
		var i = document.getElementById("context-page-translator");
		if (i)
			i.parentNode.removeChild(i);
		var i = document.getElementById("translationResult");
		if (i)
			i.parentNode.removeChild(i);
		window.removeEventListener("unload", this, false);
	},

	handleEvent : function (event) {
		switch (event.type) {
		case "unload":
			this.uninit();
			break;
		}
	},

	settargetlang : function (event) {
		if (event.button != 0)
			return;
		this._targetlang = event.target.value;
		this._prefs.setCharPref("targetlang", this._targetlang);
		this.settargetlangshow();
	},

	settargetlangshow : function () {
		document.getElementById("trtid1").setAttribute('checked', ((document.getElementById("trtid1").value != this._targetlang) ? false : true));
		document.getElementById("trtid2").setAttribute('checked', ((document.getElementById("trtid2").value != this._targetlang) ? false : true));
		document.getElementById("trtid3").setAttribute('checked', ((document.getElementById("trtid3").value != this._targetlang) ? false : true));
	},

	setshowmode : function (event) {
		if (event.button != 0)
			return;
		this._showpopuptext = !this._showpopuptext;
		this._prefs.setBoolPref("showpopuptext", this._showpopuptext);
		this.showmodeshow();
	},

	setoridisplay : function (event) {
		if (event.button != 0) return;
		this._showoritext = !this._showoritext;
		this._prefs.setBoolPref("showoritext", this._showoritext);
		this.showmodeshow();
	},

	showmodeshow : function (event) {
		document.getElementById("showsreplaced").setAttribute('checked', this._showpopuptext);
		document.getElementById("showoritext").setAttribute('checked', this._showoritext);
	},

	showContextMenu : function () {
		document.getElementById("context-translator").hidden = !(gContextMenu.isTextSelected);
		document.getElementById("context-page-translator").hidden = (gContextMenu.isTextSelected);
	},

	showStatbarContextMenu : function () {
		if (document.getElementById("translateselected-statusbar-translator")) {
			document.getElementById("translateselected-statusbar-translator").disabled = !(this.isValidTextLength(this.getSelectedText()));
		}
		this.settargetlangshow();
		this.showmodeshow();
	},

	getSelectedText : function (e) {
		var focusedWindow = document.commandDispatcher.focusedWindow;
		var selectedText = focusedWindow.getSelection().toString();
		return selectedText;
	},

	isValidTextLength : function (selectedtext) {
		if (selectedtext.length > 0 && selectedtext.length <= 38000) {
			return true;
		} else {
			return false;
		}
	},

	ToolBarTranslatorClick : function (e) {
		var tbt = document.getElementById("statusbar-translator");
		if (e.target != tbt)
			return;
		var selectedText = this.getSelectedText();
		if (this.isValidTextLength(selectedText)) {
			this.selectionTranslation(e);
		} else {
			this.pageTranslation();
		}
	},

	selectionTranslation : function (event) {
		var selectedText = this.getSelectedText();
		this.refreshInformation(selectedText);
	},

	pageTranslation : function (e) {
		var cel = this._targetlang;
		var docurl = content.location.href;
		var fordUrl = "http://translate.google.de/translate?sl=auto&tl=" + cel + "&js=n&prev=_t&hl=" + cel + "&ie=UTF-8&u=" + encodeURIComponent(docurl);
		gBrowser.selectedTab = gBrowser.addTab(fordUrl);
	},

	refreshInformation : function (whatToTranslate) {
		if (this.isValidTextLength(whatToTranslate)) {
			var cel = this._targetlang;
			var httpRequest = null;

			var baseUrl = "http://translate.google.hu/translate_t";
			var urlParams = "text=" + encodeURIComponent(whatToTranslate) + "&hl=" + cel + "&langpair=auto|" + cel + "&tbb=1";

			function removeHTMLTags(mitkell) {
				//var strTagStrippedText = mitkell.replace(/<\/?[^>]+(>|$)/g, "");
				if (gTranslator._showoritext == false) {
					var strTagStrippedText = mitkell.replace(/<br>/ig, '\n').replace(/(<(.+?)fff\'\">)/ig, "").replace(/<\/[^>]+>/ig, "");
				} else {
					var strTagStrippedText = mitkell.replace(/<br>/ig, '\n\n')
						.replace(/<span title=\"/ig, "")
						.replace(/\"\sonmouseover[^>]+>/ig, '\n')
						.replace(/<\/[^>]+>/ig, "");
				}

				return strTagStrippedText;
			}

			function infoReceived() {
				var output = httpRequest.responseText;
				if (whatToTranslate[0] == " ") {
					var kezdospace = " ";
				} else {
					var kezdospace = "";
				}
				if (whatToTranslate[whatToTranslate.length - 1] == " ") {
					var vegespace = " ";
				} else {
					var vegespace = "";
				}
				if (output.length) { //kimeneti string felepitese
					output = output.replace(/&quot;/gi, '"');
					output = output.replace(/&lt;/gi, '<');
					output = output.replace(/&gt;/gi, '>');
					output = output.replace(/&amp;/gi, '&');
					output = output.replace(/&#39;/gi, "'");
					var fieldArray = output.split('</head>');
					if (fieldArray[1].search('class="short_text"') != -1) {
						var tempResz = fieldArray[1].split('<span id=result_box class="short_text">');
					} else if (fieldArray[1].search('class="medium_text"') != -1) {
						var tempResz = fieldArray[1].split('<span id=result_box class="medium_text">');
					} else {
						var tempResz = fieldArray[1].split('<span id=result_box class="long_text">');
					}
					var kimenet = tempResz[1].split('</span></div>');
					if (gTranslator._showpopuptext === false) {
						var focusedWindow = document.commandDispatcher.focusedWindow;
						var range = focusedWindow.getSelection().getRangeAt(0);
						range.deleteContents();
						range.insertNode(document.createTextNode(kezdospace + removeHTMLTags(kimenet[0]) + vegespace));
					} else {
						gTranslator.show(kezdospace + removeHTMLTags(kimenet[0]) + vegespace);
					}
				}
			}

			try {
				httpRequest = new XMLHttpRequest();
				httpRequest.open("POST", baseUrl, true);
				httpRequest.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
				httpRequest.setRequestHeader("Content-length", urlParams.length);
				httpRequest.setRequestHeader("Connection", "close");
				httpRequest.onload = infoReceived;
				httpRequest.send(urlParams);
				if (gTranslator._showpopuptext === true)
					this.show("正在获取翻译结果,请等待...");
			} catch (e) {}
		} else { //ha a kijelolt szoveg hossza <=0 vagy >38000
			var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
				.getService(Components.interfaces.nsIPromptService);
			prompts.alert(null, "Google Translator", "选中的文本不能超过38000个字符！");
		}
	},

	show : function (res) {
		var popup = document.getElementById("translationResult");
		this.setValue(res);
		this.sizeChange();
		var node = document.getElementById("content");
		if (!node) {
			node = document.getElementById("messagepane");
		}
		if (this._timer)
			clearTimeout(this._timer);

		if (typeof popup.openPopup != 'undefined')
			popup.openPopup(node, "overlap", 0, 0, true, false);
		else
			popup.showPopup(node, -1, -1, "popup", null, null);
		setTimeout(function () {
			gTranslator.sizeChange();
		}, 0);
		this._timer = setTimeout(function () {
				popup.hidePopup();
			}, 15000); //最大30秒で消す
	},

	setValue : function (val) {
		var label = document.getElementById("translationResultPopupLabel");
		while (label.firstChild) {
			label.removeChild(label.firstChild);
		}
		if (val != "")
			label.appendChild(document.createTextNode(val));
	},

	sizeChange : function () {
		var popup = document.getElementById("translationResult");
		var box = document.getElementById("translationResultPopupBox");
		popup.sizeTo(450, Math.max(box.boxObject.height * 1.0 + 15, 23));
	},

	insertAfter : function (newElement, targetElement) {
		var aparent = targetElement.parentNode;
		if (aparent.lastChild == targetElement) {
			aparent.appendChild(newElement);
		} else {
			aparent.insertBefore(newElement, targetElement.nextSibling);
		}
	},

	copyToClipboard : function (e, aValue) {
		if (e.button == 0) {
			var clipid = Components.interfaces.nsIClipboard;
			var clip = Components.classes['@mozilla.org/widget/clipboard;1'].getService(clipid);
			if (!clip) {
				return;
			}
			var trans = Components.classes['@mozilla.org/widget/transferable;1'].
				createInstance(Components.interfaces.nsITransferable);
			if (!trans) {
				return;
			}
			var str = Components.classes['@mozilla.org/supports-string;1'].
				createInstance(Components.interfaces.nsISupportsString);
			str.data = aValue;
			trans.setTransferData("text/unicode", str, aValue.length * 2);
			clip.setData(trans, null, clipid.kGlobalClipboard);
		} else if (e.button == 2) {
			var popup = document.getElementById("translationResult");
			clearTimeout(this._timer);
			popup.hidePopup();
		}
	}
};
gTranslator.onLoad();