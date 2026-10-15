// Chest transfer logic — drag-and-drop item movement with animations between inventory and chest slots

var _TextureSource = WRAP_JAVA('com.zhekasmirnov.innercore.api.mod.ui.TextureSource');
_TextureSource = _TextureSource.instance;

function StringToBitmap(encodedString) {
    try {
        var encodeByte = android.util.Base64.decode(encodedString, 0);
        var bitmap = android.graphics.BitmapFactory.decodeByteArray(encodeByte, 0, encodeByte.length);
        return bitmap;
    } catch (e) {
        return null;
    }
}

// Embedded transfer bar textures (base64 PNG)
_TextureSource.put('___transferBarFull', StringToBitmap("iVBORw0KGgoAAAANSUhEUgAAAA8AAAADCAIAAADDdsJmAAAAEUlEQVR4AWNk+M9APGCkoWoADp8DAS0NIF4AAAAASUVORK5CYII="));
_TextureSource.put('___transferBarEmpty', StringToBitmap("iVBORw0KGgoAAAANSUhEUgAAAA8AAAADCAIAAADDdsJmAAAAEklEQVR4AWP08fFlIBow0lA1APMhArOjizwiAAAAAElFTkSuQmCC"));

function isAutoStackSourceSlot(name) {
    return isChestSlotName(name) || isCraftGridSlotName(name);
}

function autoStackEventName(sourceSlot, targetSlot) {
    var sourceGrid = isCraftGridSlotName(sourceSlot);
    var targetGrid = isCraftGridSlotName(targetSlot);
    if (sourceGrid) {
        if (targetGrid) return "gridToGrid";
        if (isChestSlotName(targetSlot)) return "gridToChest";
        return "gridToInventory";
    }
    if (isChestSlotName(sourceSlot)) {
        if (targetGrid) return "chestToGrid";
        if (isChestSlotName(targetSlot)) return "SlotToSlot";
        return "SlotToInventorySlot";
    }
    if (targetGrid) return "inventoryToGrid";
    if (isChestSlotName(targetSlot)) return "InventorySlotToContainerSlot";
    return "InventorySlotToSlot";
}

function getScrollY(window) {
    var view = window.layout;
    var scrollY = 0;
    try {
        while (true) {
            scrollY += view.getScrollY();
            view = view.getChildAt(0);
        }
    } catch (errr) {}
    return scrollY;
}

function slotCenterGlobal(window, x, y, size) {
    var scrollY = getScrollY(window);
    var scale = window.getScale();
    return {
        x: window.location.windowToGlobal(x + size / 2) + window.location.x,
        y: window.location.windowToGlobal(((y + size / 2) * scale - scrollY) / scale) + window.location.y
    };
}

var JAVA_ANIMATOR = android.animation.ValueAnimator;
var JAVA_HANDLER = android.os.Handler;
var LOOPER_THREAD = android.os.Looper;

var JAVA_HANDLER_THREAD = new JAVA_HANDLER(LOOPER_THREAD.getMainLooper());

function createAnim(values, duration, updateFunc) {
    var animation = JAVA_ANIMATOR.ofFloat(values);
    animation.setDuration(duration);
    if (updateFunc) animation.addUpdateListener({
        onAnimationUpdate: function(updatedAnim) {
            updateFunc(updatedAnim.getAnimatedValue(), updatedAnim);
        }
    });
    JAVA_HANDLER_THREAD.post({
        run: function() {
            animation.start();
        }
    });
    return animation;
}

function defaultChestData() {
    return {
        valid: false,
        container: null,
        currentWindow: null,
        sourceSlot: null,
        sourceSlotType: null,
        start: false,
        item: {
            maxCount: 0,
            count: 0
        },
        barData: {
            name: "",
            x: 0,
            y: 0
        },
        pre_selectedSlot: null,
        selectedSlot: null,
        selectedSlotType: null,
        lastClickTime: 0,
        progressHandle: null,
        anim: {
            pos1: {
                slotSize: 0,
                window: null,
                x: 0,
                y: 0
            },
            pos2: {
                x: 0,
                y: 0
            }
        }
    }
}

var chestData = defaultChestData();
var uniqueId_ = 0;
var chestTransferWindowBySlotName = {};
var chestTransferSlotNameByIndex = {};
var chestTransferStats = {
    animationsStarted: 0,
    animationsEnded: 0,
    animationsActive: 0,
    animationsPeak: 0,
    animationFrames: 0
};

// Singleton overlay for item transfer animations (created once, reused across clicks)
var _sharedOverlay = null;
var transferAnimationOffsetX = -45;

var _overlayWindowDef = {
    location: {
        x: 0,
        y: 0,
        width: 1000,
        height: UI.getScreenHeight()
    },
    drawing: [{ type: 'color', color: android.graphics.Color.TRANSPARENT }],
    elements: {}
};

// Registers drag-and-drop handlers on all windows in a window group
function registerForWindow(_window, _options) {
    _options = Object.assign({ speed: 250, bonusSize: 2 }, _options || {});

    function startAnim(window, slot, size, size1) {
        var content = window.getContent();
        if (typeof window.isOpened == "function" && !window.isOpened() && typeof window.open == "function") {
            window.open();
        }
        chestTransferStats.animationsStarted++;
        chestTransferStats.animationsActive++;
        if (chestTransferStats.animationsActive > chestTransferStats.animationsPeak) {
            chestTransferStats.animationsPeak = chestTransferStats.animationsActive;
        }
        var slot_id = '$slot' + (++uniqueId_);
        var pos1 = { x: chestData.anim.pos1.x + transferAnimationOffsetX, y: chestData.anim.pos1.y };
        var pos2 = { x: chestData.anim.pos2.x + transferAnimationOffsetX, y: chestData.anim.pos2.y };
        content.elements[slot_id] = {
            type: "slot",
            x: pos1.x - size / 2,
            y: pos1.y - size / 2,
            size: (size || 70) + _options.bonusSize,
            source: {
                id: slot.id,
                count: 1,
                data: slot.data,
                extra: slot.extra || null
            },
            bitmap: "_default_slot_empty",
            visual: true
        };
        window.forceRefresh();
        var elements = window.getElements();
        var animation = createAnim([0, 1], _options.speed, function(value) {
            if (!window.isOpened()) return;
            chestTransferStats.animationFrames++;
            var _x = pos1.x + (pos2.x - pos1.x) * value;
            var _y = pos1.y + (pos2.y - pos1.y) * value;
            var slotElement = window.getElements().get(slot_id);
            var _size = Math.round(size + (size1 - size) * value + _options.bonusSize);
            content.elements[slot_id].size = _size;
            content.elements[slot_id].x = _x - _size / 2;
            content.elements[slot_id].y = _y - _size / 2;
            slotElement.setPosition(_x - _size / 2, _y - _size / 2);
            window.forceRefresh();
        });
        animation.addListener({
            onAnimationEnd: function() {
                delete content.elements[slot_id];
                chestTransferStats.animationsEnded++;
                chestTransferStats.animationsActive--;
                if (!window.isOpened()) return;
                var elementProvider = window.getElementProvider();
                elementProvider.removeElement(elements.get(slot_id));
                window.forceRefresh();
            }
        });
    }

    var handlersOnly = !!_options.handlersOnly;
    var groupWindow = _window.getWindow ? true : false;
    var mainWindow = groupWindow ? _window.getAllWindows().get(_window.getAllWindows().size() - 1) : _window;
    if (!handlersOnly && !_sharedOverlay) {
        _sharedOverlay = groupWindow ? _window.addWindow('overlay', _overlayWindowDef) : new UI.Window(_overlayWindowDef);
        _sharedOverlay.setAsGameOverlay(true);
        _sharedOverlay.setTouchable(false);
        _sharedOverlay.location.setZ(1000);
    } else if (!handlersOnly) {
    }
    var overlayWindow = _sharedOverlay;
    if (!handlersOnly) {
    mainWindow.setEventListener({
        onClose: function() {
            resetChestTransferState();
            if (!groupWindow) overlayWindow.close();
        },
        onOpen: function(window) {
            var elements = window.getElements();
            if (elements.get("selection1___")) elements.get("selection1___").setPosition(-1000, -1000);
            if (elements.get("scale1___")) elements.get("scale1___").setPosition(-1000, -1000);
            stopChestTransferProgress();
            chestData.start = false;
            chestData.selectedSlot = null;
            chestData.selectedSlotType = null;
            if (!groupWindow) overlayWindow.open();
        }
    });
    }

    function slotOnTouchEvent(element, event) {
        if (!chestData.valid) { debugLog("[MP:CLIENT] slotOnTouchEvent BLOCKED — chestData.valid=false container=" + (chestData.container ? chestData.container : "null")); return; }
        var currentSlotType = this.type == 'frame' ? 0 : 1;
        var slotSize = this.size || this.slot_size || 60;
        var _elements_ = element.window.getContent().elements;
        _elements_['scale1___'].scale = 60 / 108 * slotSize / 15;
        _elements_["selection1___"].width = _elements_["selection1___"].height = slotSize;
        var slot_id = this.slot_id || this.slot_id___ || 0;
        var uiAdapter = element.window.getContainer();
        chestData.container = uiAdapter.getParent();
        chestData.currentWindow = element.window;
        var item = currentSlotType ? chestData.container.getSlot(slot_id) : Player.getInventorySlot(slot_id);
        var event_type = event.type;
        var elements___ = element.window.getElements();
        
        // Double-click: auto-stack matching items
        if (event.type == 'CLICK' && chestData.selectedSlot != null) {
            if (chestData.selectedSlot == slot_id) {
                chestData.selectedSlot = null;
                chestData.selectedSlotType = null;
                if (java.lang.System.currentTimeMillis() - chestData.lastClickTime <= 500) {
                    var maxStack = Item.getMaxStack(item.id);
                    if (item.count < maxStack) {
                        debugLog("Auto-stack triggered for slot " + slot_id);
                        var needCount = maxStack - item.count;
                        var slots = chestData.container.slots;
                        var pos2 = slotCenterGlobal(element.window, this.x, this.y, slotSize);
                        chestData.anim.pos2 = {
                            window: element.window,
                            x: pos2.x,
                            y: pos2.y
                        };
                        if (currentSlotType) {
                            for (var i in slots) {
                                if (!isAutoStackSourceSlot(i)) continue;
                                var item2 = slots[i];
                                if (!item2 || item2.count <= 0 || i == slot_id || item2.id != item.id || item2.data != item.data || !extraMatch(item2.extra, item.extra)) continue;
                                var _count = Math.min(item2.count, needCount);
                                needCount -= _count;
                                chestData.container.sendEvent(autoStackEventName(i, slot_id), { slot1: i, slot2: slot_id, count: _count });
                                var thiswindow = chestTransferWindowBySlotName[i];
                                if (!thiswindow) continue;
                                var thiswindowElements = thiswindow.getContent().elements;
                                var pos1 = slotCenterGlobal(thiswindow, thiswindowElements[i].x, thiswindowElements[i].y, thiswindowElements[i].size || 60);
                                chestData.anim.pos1 = {
                                    window: thiswindow,
                                    slotSize: thiswindowElements[i].size || 60,
                                    x: pos1.x,
                                    y: pos1.y
                                }
                                startAnim(overlayWindow, chestData.container.getSlot(i), thiswindow.location.windowToGlobal(chestData.anim.pos1.slotSize), element.window.location.windowToGlobal(slotSize));
                                if (needCount <= 0) break;
                            }
                            if (needCount > 0) {
                                for (var i = 0; i <= 35; i++) {
                                    var item2 = Player.getInventorySlot(i);
                                    if (!item2 || item2.id != item.id || item2.data != item.data || !extraMatch(item2.extra, item.extra)) continue;
                                    var _count = Math.min(item2.count, needCount);
                                    needCount -= _count;
                                    chestData.container.sendEvent(autoStackEventName(i, slot_id), { slot1: i, slot2: slot_id, count: _count });
                                    var thiswindow = chestTransferWindowBySlotName[chestTransferSlotNameByIndex[i]];
                                    if (!thiswindow) continue;
                                    var thiswindowElements = thiswindow.getContent().elements;
                                    var pos1 = slotCenterGlobal(thiswindow, thiswindowElements[chestTransferSlotNameByIndex[i]].x, thiswindowElements[chestTransferSlotNameByIndex[i]].y, thiswindowElements[chestTransferSlotNameByIndex[i]].size || 60);
                                    chestData.anim.pos1 = {
                                        window: thiswindow,
                                        slotSize: thiswindowElements[chestTransferSlotNameByIndex[i]].size || 60,
                                        x: pos1.x,
                                        y: pos1.y
                                    }
                                    startAnim(overlayWindow, Player.getInventorySlot(i), thiswindow.location.windowToGlobal(chestData.anim.pos1.slotSize), element.window.location.windowToGlobal(slotSize));
                                    if (needCount <= 0) break;
                                }
                            }
                        } else {
                            var maxStack = Item.getMaxStack(item.id);
                            if (item.count < maxStack) {
                                for (var i = 0; i <= 35; i++) {
                                    var item2 = Player.getInventorySlot(i);
                                    if (!item2 || i == slot_id || item2.id != item.id || item2.data != item.data || !extraMatch(item2.extra, item.extra)) continue;
                                    var _count = Math.min(item2.count, needCount);
                                    needCount -= _count;
                                    chestData.container.sendEvent(autoStackEventName(i, slot_id), { slot1: i, slot2: slot_id, count: _count });
                                    var thiswindow = chestTransferWindowBySlotName[chestTransferSlotNameByIndex[i]];
                                    if (!thiswindow) continue;
                                    var thiswindowElements = thiswindow.getContent().elements;
                                    var pos1 = slotCenterGlobal(thiswindow, thiswindowElements[chestTransferSlotNameByIndex[i]].x, thiswindowElements[chestTransferSlotNameByIndex[i]].y, thiswindowElements[chestTransferSlotNameByIndex[i]].size || 60);
                                    chestData.anim.pos1 = {
                                        window: thiswindow,
                                        slotSize: thiswindowElements[chestTransferSlotNameByIndex[i]].size || 60,
                                        x: pos1.x,
                                        y: pos1.y
                                    }
                                    startAnim(overlayWindow, Player.getInventorySlot(i), thiswindow.location.windowToGlobal(chestData.anim.pos1.slotSize), element.window.location.windowToGlobal(slotSize));
                                    if (needCount <= 0) break;
                                }
                                if (needCount > 0) {
                                    for (var i in slots) {
                                        if (!isAutoStackSourceSlot(i)) continue;
                                        var item2 = slots[i];
                                        if (!item2 || item2.count <= 0 || item2.id != item.id || item2.data != item.data || !extraMatch(item2.extra, item.extra)) continue;
                                        var _count = Math.min(item2.count, needCount);
                                        needCount -= _count;
                                        chestData.container.sendEvent(autoStackEventName(i, slot_id), { slot1: i, slot2: slot_id, count: _count });
                                        var thiswindow = chestTransferWindowBySlotName[i];
                                        if (!thiswindow) continue;
                                        var thiswindowElements = thiswindow.getContent().elements;
                                        var pos1 = slotCenterGlobal(thiswindow, thiswindowElements[i].x, thiswindowElements[i].y, thiswindowElements[i].size || 60);
                                        chestData.anim.pos1 = {
                                            window: thiswindow,
                                            slotSize: thiswindowElements[i].size || 60,
                                            x: pos1.x,
                                            y: pos1.y
                                        }
                                        startAnim(overlayWindow, chestData.container.getSlot(i), thiswindow.location.windowToGlobal(chestData.anim.pos1.slotSize), element.window.location.windowToGlobal(this.slot_size));
                                        if (needCount <= 0) break;
                                    }
                                }
                            }
                        }
                    }
                }
                var __window = chestData.anim.pos1.window || element.window;
                var elements___2 = __window.getElements();
                if (elements___2.containsKey("scale1___")) elements___2.get("scale1___").setPosition(-300, -300);
                if (elements___.containsKey("scale1___")) elements___.get("scale1___").setPosition(-300, -300);
                chestData.container.setScale('scale1___', 0);
                if (elements___2.containsKey("selection1___")) elements___2.get("selection1___").setPosition(-1000, -1000);
                if (elements___.containsKey("selection1___")) elements___.get("selection1___").setPosition(-1000, -1000);
                return;
            }
            chestData.item.count = Math.min(Math.floor(chestData.item.count), chestData.item.maxCount);
            var targetIsGrid = currentSlotType && isCraftGridSlotName(slot_id);
            var sourceIsGrid = chestData.selectedSlotType && isCraftGridSlotName(chestData.selectedSlot);
            if (targetIsGrid || sourceIsGrid) {
                var eventName;
                if (targetIsGrid && sourceIsGrid) {
                    eventName = "gridToGrid";
                    chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                } else if (targetIsGrid && chestData.selectedSlotType == 0) {
                    eventName = "inventoryToGrid";
                    chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                } else if (sourceIsGrid && !currentSlotType) {
                    eventName = "gridToInventory";
                    chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                } else if (targetIsGrid && chestData.selectedSlotType == 1) {
                    eventName = "chestToGrid";
                    chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                } else if (sourceIsGrid && currentSlotType) {
                    eventName = "gridToChest";
                    chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                }
                debugLog_event("Dispatching " + eventName + " src=" + chestData.selectedSlot + " dst=" + slot_id + " count=" + chestData.item.count);
            } else {
                var eventName;
                if (currentSlotType) {
                    if (chestData.selectedSlotType == 0) {
                        eventName = "InventorySlotToContainerSlot";
                        chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                    } else {
                        eventName = "SlotToSlot";
                        chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                    }
                } else {
                    if (chestData.selectedSlotType == 0) {
                        eventName = "InventorySlotToSlot";
                        chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                    } else {
                        eventName = "SlotToInventorySlot";
                        chestData.container.sendEvent(eventName, { slot1: chestData.selectedSlot, slot2: slot_id, count: chestData.item.count });
                    }
                }
                debugLog_event("Dispatching " + eventName + " src=" + chestData.selectedSlot + " dst=" + slot_id + " count=" + chestData.item.count);
            }
            var pos2 = slotCenterGlobal(element.window, this.x, this.y, slotSize);
            chestData.anim.pos2 = {
                x: pos2.x,
                y: pos2.y
            }
            var __window = chestData.anim.pos1.window;
            var elements___2 = __window.getElements();
            var slotSize__ = chestData.anim.pos1.slotSize || 250;
            var pos1 = slotCenterGlobal(__window, chestData.anim.pos1.pre_x, chestData.anim.pos1.pre_y, slotSize__);
            chestData.anim.pos1.x = pos1.x;
            chestData.anim.pos1.y = pos1.y;
            startAnim(overlayWindow, chestData.selectedSlotType ? chestData.container.getSlot(chestData.selectedSlot) : Player.getInventorySlot(chestData.selectedSlot), __window.location.windowToGlobal(slotSize__), element.window.location.windowToGlobal(slotSize));
            var _pos2 = {
                window: chestData.anim.pos2,
                x: chestData.anim.pos2.x,
                y: chestData.anim.pos2.y
            };
            chestData.anim.pos2 = chestData.anim.pos1;
            chestData.anim.pos1 = _pos2;
            var item2 = chestData.selectedSlotType ? chestData.container.getSlot(chestData.selectedSlot) : Player.getInventorySlot(chestData.selectedSlot);
            if (item.id != 0 && (item2.id != item.id || item2.count > Item.getMaxStack(item.id) - item.count)) startAnim(overlayWindow, item, element.window.location.windowToGlobal(slotSize), chestData.anim.pos2.window.location.windowToGlobal(chestData.anim.pos2.slotSize || 251));
            if (elements___2.containsKey("scale1___")) elements___2.get("scale1___").setPosition(-300, -300);
            if (elements___.containsKey("scale1___")) elements___.get("scale1___").setPosition(-300, -300);
            chestData.container.setScale('scale1___', 0);
            if (elements___2.containsKey("selection1___")) elements___2.get("selection1___").setPosition(-1000, -1000);
            if (elements___.containsKey("selection1___")) elements___.get("selection1___").setPosition(-1000, -1000);
            chestData.selectedSlot = null;
            chestData.selectedSlotType = null;
            return;
        }
        if (event.type == 'CANCEL') {
            event_type = 'UP';
        }
        if (event.type == 'CLICK') event_type = 'UP';
        if (event_type == 'DOWN') {
            if (item.id == 0 || chestData.selectedSlot != null) return;
            chestData.item = {
                maxCount: item.count,
                count: 1
            }
            chestData.sourceSlot = slot_id;
            chestData.sourceSlotType = currentSlotType;
            chestData.pre_selectedSlot = slot_id;
            chestData.start = World.getThreadTime() + 10;
            chestData.tickStarted = false;
            chestData.barData = {
                name: "scale1___",
                x: this.x + (slotSize - _elements_['scale1___'].scale * 15) / 2,
                y: this.y
            }
            element.window.forceRefresh();
            elements___.get('selection1___').setPosition(this.x, this.y);
            chestData.lastClickTime = java.lang.System.currentTimeMillis();
            chestData.anim.pos1 = {
                window: element.window,
                slotSize: slotSize,
                pre_x: this.x,
                pre_y: this.y
            };
            startChestTransferProgress();
        }
        if (event_type == 'UP') {
            if (chestData.selectedSlot != null || !chestData.start) return;
            chestData.start = false;
            stopChestTransferProgress();
            chestData.selectedSlot = slot_id;
            chestData.selectedSlotType = currentSlotType;
            chestData.pre_selectedSlot = null;
            if (!chestData.tickStarted) chestData.item.count = chestData.item.maxCount;
        }
    }

    var main_content = { elements: {} };
    var allWindows = groupWindow ? _window.getAllWindows().toArray() : [_window];
    for (var k in allWindows) {
        var ___window = allWindows[k];
        if (overlayWindow && overlayWindow == ___window) continue;
        if (mainWindow != ___window) ___window.setEventListener({
            onOpen: function(window) {
                var elements = window.getElements();
                if (elements.get("selection1___")) elements.get("selection1___").setPosition(-1000, -1000);
                if (elements.get("scale1___")) elements.get("scale1___").setPosition(-1000, -1000);
            }
        });
        var windowContent = ___window.getContent();
        windowContent.elements['scale1___'] = {
            type: "scale",
            x: -300,
            y: -300,
            z: 100001,
            direction: 0,
            bitmap: "___transferBarFull",
            background: "___transferBarEmpty",
            value: 0,
            scale: 60 / 108 * 100 / 15
        };
        windowContent.elements["selection1___"] = {
            type: "image",
            x: -1000,
            y: -1000,
            z: 100000,
            bitmap: "style:selection",
            width: 100,
            height: 100
        }
        var processedCount = 0;
        for (var i in windowContent.elements) {
            if (windowContent.elements[i].type == '_invalidate') continue;
            if ((windowContent.elements[i].type.indexOf('slot') == -1 && windowContent.elements[i].type.indexOf('Slot') == -1) || windowContent.elements[i].clicker || windowContent.elements[i].visual || windowContent.elements[i].onTouchEvent) continue;
            if (windowContent.elements[i].type == 'invSlot') {
                chestTransferSlotNameByIndex[windowContent.elements[i].index] = i;
                windowContent.elements["_CLICKFRAME_" + (++uniqueId_)] = {
                    type: "frame",
                    x: windowContent.elements[i].x,
                    y: windowContent.elements[i].y,
                    z: -100,
                    width: windowContent.elements[i].size || 60,
                    height: windowContent.elements[i].size || 60,
                    bitmap: "_default_slot_empty",
                    slot_id: windowContent.elements[i].index || 0,
                    slot_size: windowContent.elements[i].size || 60,
                    slot_textid: i,
                    scale: 1,
                    onTouchEvent: slotOnTouchEvent
                }
                continue;
            }
            windowContent.elements[i].visual = true;
            windowContent.elements[i].slot_id___ = i;
            windowContent.elements[i].onTouchEvent = slotOnTouchEvent;
            processedCount++;
        }
        Object.assign(main_content.elements, windowContent.elements);
        for (var k in windowContent.elements) {
            chestTransferWindowBySlotName[k] = ___window;
        }
        ___window.forceRefresh();
    }
    debugLog("[MP:CLIENT] registerForWindow done — touch handlers installed, chestData.valid=" + chestData.valid + " poolSize=" + Object.keys(_chestSlotPool).length);
}

// Progress handler for the hold-to-transfer bar, driven by TickScheduler.local.
function chestTransferProgressTick() {
    if (chestData.valid && chestData.start && World.getThreadTime() >= chestData.start && chestData.item.count < chestData.item.maxCount && chestData.currentWindow) {
        var elements = chestData.currentWindow.getElements();
        var scaleElement = elements.get(chestData.barData.name);
        chestData.tickStarted = true;
        chestData.item.count = Math.min(chestData.item.maxCount, chestData.item.count + chestData.item.maxCount / 25);
        if (scaleElement) {
            scaleElement.setPosition(chestData.barData.x, chestData.barData.y);
            scaleElement.setBinding('value', chestData.item.maxCount > 15
                ? chestData.item.count / chestData.item.maxCount
                : Math.floor(chestData.item.count) / chestData.item.maxCount);
        }
        if (Math.floor(chestData.item.count) % 5 == 0) {
        }
    }
}

function startChestTransferProgress() {
    stopChestTransferProgress();
    chestData.progressHandle = TickScheduler.local.ensureInterval("chestTransfer.progress", 1, chestTransferProgressTick, { owner: "crafting_station" });
}

function stopChestTransferProgress() {
    if (chestData.progressHandle && typeof chestData.progressHandle.cancel == "function") {
        chestData.progressHandle.cancel();
    }
    chestData.progressHandle = null;
}

function resetChestTransferState() {
    if (typeof DEBUG != "undefined" && DEBUG && chestTransferStats.animationsStarted > 0) {
        chestTransferStats.animationsStarted = 0;
        chestTransferStats.animationsEnded = 0;
        chestTransferStats.animationsActive = 0;
        chestTransferStats.animationsPeak = 0;
        chestTransferStats.animationFrames = 0;
    }
    stopChestTransferProgress();
    chestData = defaultChestData();
}
