// Recipe list panel — left side (PAGINATION — 24 slots per page, UP/DOWN buttons)
// Shows ALL recipe results, darkens unavailable ones (Refined Storage pattern)

var recipeWindowWidth = 260;
var recipeSlotSize = 180;
var recipeColumns = 4;
var recipeSlotPadding = 10;
var recipeStartX = 60;
var recipeStartY = 0;

var RECIPES_PER_PAGE = 24;
var RECIPE_ROWS = 6;
var totalRecipeSlots = RECIPES_PER_PAGE;
var recipeWindowElements = {};
var _recipeIndex = null;
var _recipeByUid = {};
var _allRecipesCache = null;
var _dedupedRecipes = null;
var _entriesCache = {};

function getEntries(recipe) {
    var uid = recipe.getRecipeUid();
    if (!_entriesCache[uid]) _entriesCache[uid] = recipe.getSortedEntries();
    return _entriesCache[uid];
}

function getRecipePrefixSafe(recipe) {
    try {
        if (typeof recipe.getPrefix != "function") return "";
        var prefix = recipe.getPrefix();
        if (prefix === undefined || prefix === null) return "";
        return String(prefix);
    } catch (e) {
        return "";
    }
}

function ingredientSignature(recipe) {
    var entries = getEntries(recipe);
    var sig = [];
    for (var i = 0; i < (entries.length || 0); i++) {
        var e = entries[i];
        if (e && e.id > 0) sig.push(e.id + ":" + e.data + ":" + (e.count || 1));
    }
    sig.sort();
    return sig.join(",");
}

// Deduplicated, vanilla-prefix recipe list. Built once (the recipe registry is
// stable after load) and reused by every refreshRecipeList call.
function buildDedupedRecipes(allRecipes) {
    if (_dedupedRecipes) return _dedupedRecipes;
    var deduped = [];
    if (!allRecipes) return deduped;
    var seen = {};
    var prefixedSkipped = 0;
    for (var r = 0; r < allRecipes.length; r++) {
        var res = allRecipes[r].getResult();
        if (!res || res.id <= 0) continue;
        if (getRecipePrefixSafe(allRecipes[r])) { prefixedSkipped++; continue; }
        var key = res.id + "_" + res.data + "_" + ingredientSignature(allRecipes[r]);
        if (seen[key] === undefined) {
            seen[key] = deduped.length;
            deduped.push(allRecipes[r]);
        }
    }
    if (prefixedSkipped > 0) debugLog("refreshRecipeList: skipped " + prefixedSkipped + " recipes with custom prefix (not craftable in station)");
    _dedupedRecipes = deduped;
    return deduped;
}

function buildRecipeIndex() {
    if (_recipeIndex) return;
    var all = getAllWorkbenchRecipes();
    if (!all) return;
    _allRecipesCache = all;
    _recipeIndex = {};
    _recipeByUid = {};
    for (var r = 0; r < all.length; r++) {
        var recipe = all[r];
        try {
            var uid = recipe.getRecipeUid();
            _recipeByUid[uid] = recipe;
            var entries = getEntries(recipe);
            for (var i = 0; i < (entries.length || 0); i++) {
                var e = entries[i];
                if (!e || !e.id || e.id == 0) continue;
                _recipeIndex[e.id] = _recipeIndex[e.id] || [];
                _recipeIndex[e.id].push(uid);
                if (e.data >= 0) {
                    var key = e.id + "_" + e.data;
                    _recipeIndex[key] = _recipeIndex[key] || [];
                    _recipeIndex[key].push(uid);
                }
            }
        } catch (x) {}
    }
    buildDedupedRecipes(all);
    debugLog("buildRecipeIndex: " + Object.keys(_recipeIndex).length + " ingredient keys");
}

function setupRecipeWindow(recipeWin) {

    var searchBarY = recipeStartY;
    var upButtonY = searchBarY + recipeSlotSize + 5;
    var slotsStartY = upButtonY + recipeSlotSize + 5;

    var recipeSearchWidth = recipeColumns * (recipeSlotSize + recipeSlotPadding) - recipeSlotPadding;
    var recipeSearchUi = UiCore.searchBox(recipeStartX, searchBarY, recipeSearchWidth, {
        bitmap: "cs_search_bar",
        height: recipeSlotSize,
        fontSize: 60,
        textLabel: "Search recipes...",
        title: "Search recipes",
        positiveLabel: "Search",
        clearable: true,
        onSearch: function(keyword, itemContainerUiHandler, itemContainer) {
            var c = itemContainer || itemContainerUiHandler;
            c = c && c.getParent ? c.getParent() : c;
            if (c && c.sendEvent) c.sendEvent("searchRecipes", { keyword: keyword });
        }
    });
    delete recipeSearchUi.frame.scale;
    recipeSearchUi.text.x = recipeStartX + 10;
    recipeSearchUi.text.y = searchBarY + 10;
    delete recipeSearchUi.text.font.shadow;
    recipeWindowElements["searchBar"] = recipeSearchUi.frame;
    recipeWindowElements["searchText"] = recipeSearchUi.text;

    recipeWindowElements["buttonUp"] = {
        type: "button",
        x: recipeStartX,
        y: upButtonY,
        bitmap: "cs_btn_up",
        bitmap2: "cs_btn_up_pressed",
        scale: 6,
        clicker: {
            onClick: function(container, window, element) {
                var c = container && container.getParent ? container.getParent() : container;
                c.sendEvent("switchRecipePage", { direction: -1 });
            }
        }
    };

    for (var i = 0; i < RECIPES_PER_PAGE; i++) {
        var col = i % recipeColumns;
        var row = Math.floor(i / recipeColumns);
        var sx = recipeStartX + col * (recipeSlotSize + recipeSlotPadding);
        var sy = slotsStartY + row * (recipeSlotSize + recipeSlotPadding);

            (function(idx, slotX, slotY) {
            recipeWindowElements["recipeSlot" + idx] = {
                type: "slot",
                x: slotX,
                y: slotY,
                size: recipeSlotSize,
                visual: true,
                clicker: {
                    onClick: function(container, window, element) {
                        var c = container && container.getParent ? container.getParent() : container;
                        c.sendEvent("selectRecipe", { visualIndex: idx });
                    },
                    onLongClick: function(container, window, element) {}
                }
            };
        })(i, sx, sy);
    }

    var downButtonY = slotsStartY + RECIPE_ROWS * (recipeSlotSize + recipeSlotPadding) + 5;
    recipeWindowElements["buttonDown"] = {
        type: "button",
        x: recipeStartX,
        y: downButtonY,
        bitmap: "cs_btn_down",
        bitmap2: "cs_btn_down_pressed",
        scale: 6,
        clicker: {
            onClick: function(container, window, element) {
                var c = container && container.getParent ? container.getParent() : container;
                c.sendEvent("switchRecipePage", { direction: 1 });
            }
        }
    };
}

function populateRecipePage(container, page, _te, playerUid) {
    var annotatedCache = _te._getRecipeCache(playerUid).annotated;
    if (!annotatedCache.length) {
        for (var i = 0; i < RECIPES_PER_PAGE; i++)
            container.setSlot("recipeSlot" + i, 0, 0, 0);
        container.sendChanges();
        recipeWindow.forceRefresh();
        return;
    }

    var totalPages = Math.ceil(annotatedCache.length / RECIPES_PER_PAGE);
    page = Math.max(0, Math.min(page, totalPages - 1));

    var start = page * RECIPES_PER_PAGE;
    var end = Math.min(start + RECIPES_PER_PAGE, annotatedCache.length);

    for (var i = 0; i < RECIPES_PER_PAGE; i++) {
        var idx = start + i;
        if (idx < annotatedCache.length) {
            var ann = annotatedCache[idx];
            var result = ann.result;
            container.setSlot("recipeSlot" + i, result.id, result.count, result.data, result.extra || null);
        } else {
            container.setSlot("recipeSlot" + i, 0, 0, 0);
        }
    }

    container.sendChanges();

    debugLog("populateRecipePage: page=" + (page + 1) + "/" + totalPages
        + " slots=" + (end - start));
}

// Convert Java Collection to JS array
function getAllWorkbenchRecipes() {
    try {
        if (typeof Recipes.getAllWorkbenchRecipes != "function") return null;
        var collection = Recipes.getAllWorkbenchRecipes();
        if (!collection) return null;
        var size = typeof collection.size == "function" ? collection.size() : collection.length;
        if (!size || size <= 0) return null;
        if (typeof collection.iterator != "function") return null;
        var arr = [];
        var iter = collection.iterator();
        while (iter.hasNext()) {
            arr.push(iter.next());
            if (arr.length % 500 == 0) java.lang.Thread.yield();
        }
        debugLog("getAllWorkbenchRecipes: " + arr.length + " recipes loaded");
        return arr;
    } catch (e) {
        debugLog("getAllWorkbenchRecipes error: " + e);
        return null;
    }
}

// Refresh recipe list — sync, 24 slots per page, sorted craftable-first
function refreshRecipeList(container, playerUid, keepScroll, _si, _te) {
    var si = _si || sideInfo;
    var playerSearch = _te.data.recipePlayerSearches[playerUid] || false;
    var playerPage = _te.data.recipePlayerPages[playerUid] || 0;
    debugLog("refreshRecipeList called (sync, player=" + playerUid + " page=" + (playerPage + 1) + "/? textSearch=" + (playerSearch || "none") + ")");
    buildRecipeIndex();

    var allRecipes = _allRecipesCache || getAllWorkbenchRecipes();

    if (!allRecipes) {
        for (var i = 0; i < totalRecipeSlots; i++)
            container.setSlot("recipeSlot" + i, 0, 0, 0);
        container.sendChanges();
        recipeWindow.forceRefresh();
        return;
    }

    var deduped = buildDedupedRecipes(allRecipes);

    debugLog("refreshRecipeList: " + allRecipes.length + " total, " + deduped.length + " unique");


    var available = {};
    for (var i = 0; i < 9; i++) {
        var gs = container.getSlot("slotGrid" + i);
        if (gs && gs.id > 0) {
            var ak = gs.id + "_" + gs.data;
            available[ak] = (available[ak] || 0) + gs.count;
        }
    }
    if (playerUid) {
        try {
            var pa = new PlayerActor(playerUid);
            for (var pi = 0; pi < 36; pi++) {
                var is = pa.getInventorySlot(pi);
                if (is && is.id > 0) {
                    var ak = is.id + "_" + is.data;
                    available[ak] = (available[ak] || 0) + is.count;
                }
            }
        } catch (e) {}
    }
    for (var side = 0; side < 6; side++) {
        if (si && si[side] && si[side].present) {
            for (var s = 0; s < si[side].length_; s++) {
                var cs = container.getSlot("side" + side + "slot" + s);
                if (cs && cs.id > 0) {
                    var ak = cs.id + "_" + cs.data;
                    available[ak] = (available[ak] || 0) + cs.count;
                }
            }
        }
    }
    var candidateUids = {};
    for (var k in available) {
        var id = parseInt(k.split("_")[0]);
        if (_recipeIndex && _recipeIndex[id]) { for (var ci = 0; ci < _recipeIndex[id].length; ci++) candidateUids[_recipeIndex[id][ci]] = true; }
        if (_recipeIndex && _recipeIndex[k])  { for (var ci = 0; ci < _recipeIndex[k].length; ci++)  candidateUids[_recipeIndex[k][ci]] = true; }
    }
    var filtered = [];
    for (var r = 0; r < deduped.length; r++) {
        if (candidateUids[deduped[r].getRecipeUid()]) filtered.push(deduped[r]);
    }
    deduped = filtered;

    var annotated = [];
    for (var r = 0; r < deduped.length; r++) {
        var recipe = deduped[r];
        var result = recipe.getResult();
        var craftable = false;
        try {
            var entries = getEntries(recipe);
            var len = entries.length || 0;
            var local = {};
            for (var k in available) local[k] = available[k];
            craftable = true;
            var entryChecked = false;
            for (var i = 0; i < len && craftable; i++) {
                var e = entries[i];
                if (!e || !e.id || e.id <= 0) continue;
                entryChecked = true;
                var need = e.count || 1;
                if (e.data == -1) {
                    var found = 0;
                    for (var k in local) {
                        var parts = k.split("_");
                        if (parseInt(parts[0]) == e.id && local[k] > 0) {
                            var take = Math.min(local[k], need - found);
                            local[k] -= take;
                            found += take;
                            if (found >= need) break;
                        }
                    }
                    if (found < need) craftable = false;
                } else {
                    var k = e.id + "_" + e.data;
                    if (!local[k] || local[k] < need) craftable = false;
                    else local[k] -= need;
                }
            }
            if (!entryChecked) craftable = false;
        } catch (e) { craftable = false; }
        annotated.push({ recipe: recipe, result: result, craftable: craftable });
    }

    annotated.sort(function(a, b) {
        if (a.craftable && !b.craftable) return -1;
        if (!a.craftable && b.craftable) return 1;
        return 0;
    });

    _te._getRecipeCache(playerUid).annotatedFull = annotated;

    if (playerSearch) {
        var kw = playerSearch.toLowerCase();
        annotated = annotated.filter(function(a) {
            try {
                var name = Item.getName(a.result.id, a.result.data);
                if (!name) return false;
                return name.toLowerCase().indexOf(kw) != -1;
            } catch (e) { return false; }
        });
        debugLog("search filter (\"" + playerSearch + "\"): " + annotated.length + " matches");
    }

    _te._getRecipeCache(playerUid).cached = [];
    for (var r = 0; r < annotated.length; r++)
        _te._getRecipeCache(playerUid).cached.push(annotated[r].recipe);

    _te._getRecipeCache(playerUid).annotated = annotated;
    var totalPages = Math.ceil(annotated.length / RECIPES_PER_PAGE);
    if (!keepScroll) playerPage = 0;
    else playerPage = Math.min(playerPage, Math.max(0, totalPages - 1));
    _te.data.recipePlayerPages[playerUid] = playerPage;
    if (USE_RS_RECIPE_LIST) {
        rsSendListToClient(container, _te, playerUid, false);
    } else {
        populateRecipePage(container, playerPage, _te, playerUid);
    }

    debugLog("refreshRecipeList (sync): " + annotated.length + " recipes, "
        + totalPages + " pages");
}

function applyRecipeSearch(container, keyword, _te, playerUid) {
    _te.data.recipePlayerSearches[playerUid] = keyword || false;
    recipeWindowElements["searchText"].text = _te.data.recipePlayerSearches[playerUid] || "Search recipes...";

    var playerSearch = _te.data.recipePlayerSearches[playerUid];
    if (!_te._getRecipeCache(playerUid).annotatedFull.length) return;

    var filtered = _te._getRecipeCache(playerUid).annotatedFull;
    if (playerSearch) {
        var kw = playerSearch.toLowerCase();
        filtered = _te._getRecipeCache(playerUid).annotatedFull.filter(function(a) {
            try {
                var name = Item.getName(a.result.id, a.result.data);
                if (!name) return false;
                return name.toLowerCase().indexOf(kw) != -1;
            } catch (e) { return false; }
        });
        debugLog("search filter (\"" + playerSearch + "\"): " + filtered.length + " matches");
    }

    _te._getRecipeCache(playerUid).cached = [];
    for (var r = 0; r < filtered.length; r++)
        _te._getRecipeCache(playerUid).cached.push(filtered[r].recipe);
    _te._getRecipeCache(playerUid).annotated = filtered;
    _te.data.recipePlayerPages[playerUid] = 0;
    _te._getRecipeCache(playerUid).rsRow = 0;
    if (USE_RS_RECIPE_LIST) {
        rsSendListToClient(container, _te, playerUid, true);
    } else {
        populateRecipePage(container, 0, _te, playerUid);
    }

    recipeWindow.forceRefresh();
}

/* ------------------------------------------- RS-style recipe list (new) --- */
// Mirrors the Refined Storage list model: search box + swipe + slider over a
// fixed slot viewport, fed by the server for the current row offset. The old
// pagination list (setupRecipeWindow) is kept and switchable via the flag.

var USE_RS_RECIPE_LIST = true;

var RS_RECIPE_COLUMNS = 4;
var RS_RECIPE_SLOT = 158;
var RS_RECIPE_PAD = recipeSlotPadding;
var RS_RECIPE_START_X = 50;
var RS_RECIPE_SEARCH_HEIGHT = recipeSlotSize;
var RS_RECIPE_GAP = 10;
var RS_RECIPE_LOCAL_HEIGHT = Math.floor((screenHeight - 45) * 1000 / recipeWindowWidth);
var RS_RECIPE_ROWS = Math.max(3, Math.floor((RS_RECIPE_LOCAL_HEIGHT - RS_RECIPE_SEARCH_HEIGHT - RS_RECIPE_GAP - 10) / (RS_RECIPE_SLOT + RS_RECIPE_PAD)));
var RS_RECIPE_SLOTS = RS_RECIPE_ROWS * RS_RECIPE_COLUMNS;

// Pure helpers shared by client and server (the client declares its actual
// visible row count on open, so the server fills the right number of slots).
function rsRowsFor(cache) { return (cache && cache.rsRows) || RS_RECIPE_ROWS; }
function rsSlotsFor(cache) { return rsRowsFor(cache) * RS_RECIPE_COLUMNS; }
function rsTotalRowsFor(count) { return Math.max(1, Math.ceil(count / RS_RECIPE_COLUMNS)); }
function rsClampRow(row, totalRows, visibleRows) {
    var maxRow = Math.max(0, totalRows - visibleRows);
    if (row < 0) row = 0;
    if (row > maxRow) row = maxRow;
    return row;
}

function rsPackEntries(annotated) {
    var out = [];
    for (var i = 0; i < annotated.length; i++) {
        var r = annotated[i].result;
        var uid = null;
        try { uid = annotated[i].recipe.getRecipeUid(); } catch (e) { uid = null; }
        out.push({ id: r.id, data: r.data, count: r.count || 1, craftable: !!annotated[i].craftable, uid: uid });
    }
    return out;
}

function rsChunkEntries(list, size) {
    var chunks = [];
    if (!list.length) { chunks.push([]); return chunks; }
    for (var i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
    return chunks;
}

var rsRecipeList = {
    page: 1,
    itemCount: 0,
    totalRows: 1,
    state: { swipeY: false, swipeSum: 0, moving: false },
    container: null,
    sliderName: "rsRecipeSlider",
    sliderStartY: 0,
    sliderX: 0,
    sliderScale: 1,
    maxY: 0,
    pagination: null,
    paginationMap: null,
    swipeHandler: null,
    sliderHandler: null,
    searchUi: null,
    items: [],
    listVersion: 0,
    pendingVersion: 0,
    pendingChunks: 0,
    pendingReceived: null,
    pendingCount: 0,
    pendingParts: null
};

function rsRecipeLiveElement(name) {
    if (typeof recipeWindow === "undefined" || !recipeWindow) return null;
    return UiCore.liveElement(recipeWindow, name, { cache: false });
}

function rsRecipeMoveSlider(page) {
    var slider = rsRecipeLiveElement(rsRecipeList.sliderName);
    if (!slider || !rsRecipeList.pagination) return;
    var pages = rsRecipeList.pagination.getPages(rsRecipeList.itemCount);
    slider.setPosition(rsRecipeList.sliderX, rsRecipeList.pagination.getCoordsFromPage(page, pages));
}

function rsRecipeRenderRows() {
    if (typeof recipeWindow != "undefined" && recipeWindow
        && typeof recipeWindow.isOpened == "function" && !recipeWindow.isOpened()) return;
    var container = rsRecipeList.container;
    if (!container || typeof container.setSlot != "function") return;
    var offset = (rsRecipeList.page - 1) * RS_RECIPE_COLUMNS;
    for (var i = 0; i < RS_RECIPE_SLOTS; i++) {
        var item = rsRecipeList.items[offset + i];
        var element = recipeWindowElements["rsRecipeSlot" + i];
        if (item) {
            container.setSlot("rsRecipeSlot" + i, item.id, item.count, item.data, null);
            if (element) element.darken = !item.craftable;
        } else {
            container.setSlot("rsRecipeSlot" + i, 0, 0, 0, null);
            if (element) element.darken = false;
        }
    }
    if (typeof recipeWindow != "undefined" && recipeWindow && recipeWindow.forceRefresh) {
        recipeWindow.forceRefresh();
    }
}

function rsRecipeSwitchPage(page, fromSwipe, dontMoveSlider) {
    if (!rsRecipeList.pagination) return false;
    var totalRows = rsTotalRowsFor(rsRecipeList.itemCount);
    var row = rsClampRow(page - 1, totalRows, RS_RECIPE_ROWS);
    var newPage = row + 1;
    if (newPage != rsRecipeList.page) {
        rsRecipeList.page = newPage;
        rsRecipeRenderRows();
    }
    if (!dontMoveSlider) rsRecipeMoveSlider(rsRecipeList.page);
    return true;
}

function rsRecipeTouchEvent(element, event) {
    var uiHandler = element.window.getContainer();
    rsRecipeList.container = uiHandler && uiHandler.getParent ? uiHandler.getParent() : uiHandler;
    var slider = rsRecipeLiveElement(rsRecipeList.sliderName);
    if (slider) {
        if (slider.start_y !== undefined) rsRecipeList.sliderStartY = slider.start_y;
        rsRecipeList.sliderX = slider.x;
        rsRecipeList.sliderScale = slider.scale || 1;
        rsRecipeList.maxY = rsRecipeList.sliderStartY + RS_RECIPE_ROWS * (RS_RECIPE_SLOT + RS_RECIPE_PAD) - RS_RECIPE_PAD - rsRecipeList.sliderScale * 15;
    }
    if (rsRecipeList.swipeHandler) rsRecipeList.swipeHandler(element, event);
}

function rsRecipeSliderEvent(element, event) {
    var uiHandler = element.window.getContainer();
    rsRecipeList.container = uiHandler && uiHandler.getParent ? uiHandler.getParent() : uiHandler;
    if (rsRecipeList.sliderHandler) rsRecipeList.sliderHandler(element, event);
}

function setupRsRecipeList(recipeWin) {

    var listTop = RS_RECIPE_SEARCH_HEIGHT + RS_RECIPE_GAP;
    var searchWidth = RS_RECIPE_COLUMNS * (RS_RECIPE_SLOT + RS_RECIPE_PAD) - RS_RECIPE_PAD;

    var searchUi = UiCore.searchBox(RS_RECIPE_START_X, 0, searchWidth, {
        bitmap: "cs_search_bar",
        height: RS_RECIPE_SEARCH_HEIGHT,
        fontSize: 60,
        textLabel: "Search recipes...",
        title: "Search recipes",
        positiveLabel: "Search",
        clearable: true,
        onSearch: function(keyword, itemContainerUiHandler, itemContainer) {
            var c = itemContainer || itemContainerUiHandler;
            c = c && c.getParent ? c.getParent() : c;
            if (c && c.sendEvent) c.sendEvent("searchRecipes", { keyword: keyword });
        }
    });
    delete searchUi.frame.scale;
    searchUi.text.x = RS_RECIPE_START_X + 10;
    searchUi.text.y = 10;
    delete searchUi.text.font.shadow;
    recipeWindowElements["searchBar"] = searchUi.frame;
    recipeWindowElements["searchText"] = searchUi.text;
    rsRecipeList.searchUi = searchUi;

    for (var r = 0; r < RS_RECIPE_ROWS; r++) {
        for (var c = 0; c < RS_RECIPE_COLUMNS; c++) {
            (function(index, x, y) {
                recipeWindowElements["rsRecipeSlot" + index] = {
                    type: "slot",
                    x: x,
                    y: y,
                    size: RS_RECIPE_SLOT,
                    visual: true,
                    clicker: {
                        onClick: function(container2, window, element) {
                            if (rsRecipeList.pendingReceived !== null) return;
                            var absIndex = (rsRecipeList.page - 1) * RS_RECIPE_COLUMNS + index;
                            var item = rsRecipeList.items[absIndex];
                            var c2 = container2 && container2.getParent ? container2.getParent() : container2;
                            c2.sendEvent("selectRecipeAt", {
                                index: absIndex,
                                version: rsRecipeList.listVersion,
                                uid: item ? item.uid : null
                            });
                        },
                        onLongClick: function(container2, window, element) {}
                    }
                };
            })(r * RS_RECIPE_COLUMNS + c, RS_RECIPE_START_X + c * (RS_RECIPE_SLOT + RS_RECIPE_PAD), listTop + r * (RS_RECIPE_SLOT + RS_RECIPE_PAD));
        }
    }

    var listBottom = listTop + RS_RECIPE_ROWS * (RS_RECIPE_SLOT + RS_RECIPE_PAD) - RS_RECIPE_PAD;
    var listRight = RS_RECIPE_START_X + RS_RECIPE_COLUMNS * (RS_RECIPE_SLOT + RS_RECIPE_PAD) - RS_RECIPE_PAD;
    var sliderScale = 6;
    var sliderLineX = listRight + 40;
    var sliderX = sliderLineX - sliderScale * 10 / 2;
    rsRecipeList.sliderX = sliderX;
    rsRecipeList.sliderStartY = listTop;
    rsRecipeList.maxY = listBottom - sliderScale * 15;

    rsRecipeList.paginationMap = {
        rsCountX: RS_RECIPE_COLUMNS,
        rsCountY: RS_RECIPE_ROWS,
        rsMaxY: rsRecipeList.maxY,
        rsSlider: { start_y: rsRecipeList.sliderStartY }
    };
    rsRecipeList.pagination = UiCore.pagination(rsRecipeList.paginationMap, {
        countX: "rsCountX", countY: "rsCountY", maxY: "rsMaxY", slider: "rsSlider"
    });

    var swipeAdapter = {
        bounds: { xStart: RS_RECIPE_START_X, xEnd: sliderLineX + 35, yStart: listTop, yEnd: listBottom },
        itemCount: function() { return rsRecipeList.itemCount; },
        pagination: rsRecipeList.pagination,
        getLastPage: function() { return rsRecipeList.page; },
        switchPage: rsRecipeSwitchPage,
        state: rsRecipeList.state,
        maxY: rsRecipeList.maxY,
        sliderStartY: rsRecipeList.sliderStartY,
        sliderScale: sliderScale,
        sliderX: sliderX,
        sliderElementName: rsRecipeList.sliderName,
        getElement: rsRecipeLiveElement,
        snapSliderOnRelease: false
    };
    rsRecipeList.swipeHandler = UiCore.attachSwipe(swipeAdapter);
    rsRecipeList.sliderHandler = UiCore.attachSlider({
        itemCount: function() { return rsRecipeList.itemCount; },
        pagination: rsRecipeList.pagination,
        switchPage: function(page) { rsRecipeSwitchPage(page, false, false); },
        state: rsRecipeList.state
    });

    recipeWindowElements["rsRecipeSlider"] = {
        type: "button",
        x: sliderX,
        start_y: listTop,
        y: listTop,
        z: 1,
        scale: sliderScale,
        bitmap: "UIC_crafts_slider",
        bitmap2: "UIC_crafts_slider_on"
    };
    recipeWindowElements["rsRecipeSliderFrame"] = {
        type: "frame",
        x: sliderLineX - 35,
        y: listTop - 10,
        width: 70,
        height: listBottom - listTop + 20,
        z: -1,
        bitmap: "UIC_empty",
        onTouchEvent: rsRecipeSliderEvent
    };
    recipeWindowElements["rsRecipeTouch"] = {
        type: "frame",
        x: RS_RECIPE_START_X,
        y: listTop,
        width: sliderLineX + 35 - RS_RECIPE_START_X,
        height: listBottom - listTop,
        z: 4,
        bitmap: "UIC_empty",
        onTouchEvent: rsRecipeTouchEvent
    };
    var recipeContent = recipeWin.getContent ? recipeWin.getContent() : null;
    if (recipeContent && recipeContent.drawing) {
        recipeContent.drawing.push({
            type: "line",
            x1: sliderLineX,
            y1: listTop,
            x2: sliderLineX,
            y2: listBottom,
            width: 3,
            color: android.graphics.Color.BLACK
        });
    }

}
