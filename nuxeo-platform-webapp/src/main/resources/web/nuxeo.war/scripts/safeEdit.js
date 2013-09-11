(function() {

  var waitPeriod = 100;

  var blockAutoSave = false;
  var lastSavedJSONData = null;
  var dirtyPage = false;

  var waitFunctions = [];
  var postRestoreFunctions = [];

  function getInputValue(domInput) {
    if (domInput.tagName == "INPUT") {
      if (domInput.type == 'text' || domInput.type == 'hidden') {
        return domInput.value;
      } else if (domInput.type == 'radio' || domInput.type == 'checkbox') {
        return domInput.checked;
      }
    } else if (domInput.tagName == "SELECT") {
      return jQuery(domInput).val();
    } else if (domInput.tagName == "TEXTAREA") {
      return jQuery(domInput).val();
    } else if (domInput.tagName == "IFRAME") {
      return jQuery(domInput).contents().find("body").html();
    }
  }

  function setInputValue(domInput, value) {

    if (domInput.tagName == "INPUT") {
      if (domInput.type == 'text' || domInput.type == 'hidden') {
        domInput.value = value;
      } else if (domInput.type == 'radio') {
        if (value == true || value == "true") {
          domInput.checked = true;
        } else {
          jQuery(domInput).removeAttr("checked");
        }
      } else if (domInput.type == 'checkbox') {
        if (value == true) {
          domInput.checked = true;
        } else {
          jQuery(domInput).removeAttr("checked");
        }
      }
    } else if (domInput.tagName == "SELECT" || domInput.tagName == "TEXTAREA") {
      jQuery(domInput).val(value).change();
    } else if (domInput.tagName == "IFRAME") {
      return jQuery(domInput).contents().find("body").html(value);
    }
  }

  function mustSkipField(field) {
    if (field.type == 'button' || field.type == 'submit') {
      return true;
    }
    if (field.name == 'javax.faces.ViewState') {
      return true;
    }
    return false;
  }

  function saveForm(key, formSelector) {
    saveForm(key, formSelector, 0, null);
  }

  function getFormItems(formSelector) {
    return jQuery(formSelector)
        .find(
            "input:not(.select2-input),select,textarea,td.mceIframeContainer>iframe");
  }

  function collectFormData(formSelector) {
    var data = {};
    getFormItems(formSelector).each(function() {
      if (!mustSkipField(this)) {
        var key = this.id;
        if (!key) {
          key = this.name;
        }
        data[key] = getInputValue(this);
      }
    });
    return data;
  }

  function saveForm(key, formSelector, savePeriod, saveCB) {
    var data = collectFormData(formSelector);
    var dataToStore = JSON.stringify(data);
    if (dataToStore == lastSavedJSONData) {
      // console.log("skip save ... no change");
    } else {
      localStorage.setItem(key, dataToStore);
      lastSavedJSONData = dataToStore;
      if (saveCB != null) {
        saveCB(data);
      }
    }
    if (savePeriod > 0 && !blockAutoSave) {
      window.setTimeout(function() {
        saveForm(key, formSelector, savePeriod, saveCB)
      }, savePeriod);
    }
    return data;
  }

  function cleanupSavedData(key) {
    // console.log("Cleanup custom storage");
    localStorage.removeItem(key);
  }

  window.processRestore = function processRestore(elts, data) {
    elts.each(function() {
      if (!mustSkipField(this)) {
        var k = this.id;
        if (!k) {
          k = this.name;
        }
        setInputValue(this, data[k]);
      }
    });
  }

  function restoreDraftFormData(key, formSelector, loadCB, savePeriod, saveCB) {
    var dataStr = localStorage.getItem(key);
    if (dataStr) { // there is some saved data

      var currentData = JSON.stringify(collectFormData(formSelector));
      // console.log("restore check", currentData, dataStr);
      if (currentData == dataStr) {
        // don't propose to restore if there is nothing new !
        return false;
      }

      // create cleanup callback
      jQuery(window).unload(function() {
        // XXX
      });
      // block auto save until use choose to restore or not
      blockAutoSave = true;
      // build load callback that UI will call if user wants to restore
      var doLoad = function(confirmLoad) {
        if (confirmLoad) {
          // restore !
          var data = JSON.parse(dataStr);
          processRestore(getFormItems(formSelector), data);

          // Any post restore actions?
          processPostRestore(formSelector, data);
        } else {
          // drop saved data !
          cleanupSavedData(key);
        }
        blockAutoSave = false;
        if (savePeriod > 0) {
          window.setTimeout(function() {
            saveForm(key, formSelector, savePeriod, saveCB)
          }, savePeriod);
        }
      };
      if (loadCB != null) {
        if (!loadCB(doLoad)) {
          return true;
        }
      } else {
        doLoad();
      }
      return true;
    }
    return false;
  }

  function bindOnChange(formSelector, cb) {

    getFormItems(formSelector).each(function() {
      var targetDomItem = jQuery(this);
      if (this.tagName == "IFRAME") {
        targetDomItem = jQuery(this).contents().find("body");
        targetDomItem.bind("DOMSubtreeModified", cb);
      } else {
        targetDomItem.change(cb);
      }
    });
  }

  function detectDirtyPage(formSelector, message) {
    bindOnChange(formSelector, function(event) {
      if (!dirtyPage) {
        jQuery(window).bind('beforeunload', function() {
          return message;
        });
      }
      dirtyPage = true;
    });
    jQuery(formSelector).submit(function() {
      dirtyPage = false;
      jQuery(window).unbind('beforeunload');
      return true;
    })
  }

  function processPostRestore(formSelector, data) {
    for ( var i = 0, len = registerPostRestoreCallBacks.length; i < len; i++) {
      postRestoreFunctions[i](formSelector, data);
    }
  }

  function doInitSafeEdit(key, formSelector, savePeriod, saveCB, loadCB,
      message) {
    var loaded = restoreDraftFormData(key, formSelector, loadCB, savePeriod,
        saveCB);
    bindOnChange(formSelector, function(event) {
      if (!dirtyPage) {
        // first time we detect a dirty page, we start force save
        saveForm(key, formSelector, savePeriod, saveCB);
        jQuery(window).bind('beforeunload', function() {
          // return message
          return message;
        });
        // if the user really wanna leave the page, then we clear the
        // localstorage
        jQuery(window).bind('unload', function() {
          cleanupSavedData(key);
        });
      }
      dirtyPage = true;
    });
    jQuery(formSelector).submit(function() {
      dirtyPage = false;
      jQuery(window).unbind('beforeunload');
      cleanupSavedData(key);
      return true;
    })
  }

  function initWhenPageReady(key, formSelector, savePeriod, saveCB, loadCB,
      message, waitFunctionIndex) {
    if (waitFunctionIndex > waitFunctions.length - 1) {
      // Nothing to wait, lets' go!
      doInitSafeEdit(key, formSelector, savePeriod, saveCB, loadCB, message);
    } else {
      var stillWaiting = !(waitFunctions[waitFunctionIndex]());
      if (stillWaiting) {
        // Something is still loading, let's give it more time (i.e. waitPeriod)
        //console.debug('waiting ... ');
        window.setTimeout(function() {
          initWhenPageReady(key, formSelector, savePeriod, saveCB, loadCB,
              message, waitFunctionIndex);
        }, waitPeriod);
      } else {
        // The thing we were waiting for has finished to load, let's wait for the next one
        initWhenPageReady(key, formSelector, savePeriod, saveCB, loadCB,
            message, waitFunctionIndex + 1);
      }
    }
  }

  window.registerSafeEditWait = function registerSafeEditWait(waitFct) {
    waitFunctions.push(waitFct);
  }

  window.registerPostRestoreCallBacks = function registerPostRestoreCallBacks(
      postRestoreFct) {
    postRestoreFunctions.push(postRestoreFct);
  }

  window.initSafeEdit = function initSafeEdit(key, formSelector, savePeriod,
      saveCB, loadCB, message) {
    initWhenPageReady(key, formSelector, savePeriod, saveCB, loadCB, message, 0);
  }

})();
