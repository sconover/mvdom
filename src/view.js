var utils = require("./utils.js");
var dom = require("./dom.js");

module.exports = {
	hook: hook,
	display: display,
	remove: remove,
	empty: empty
};

var viewDefDic = {};

var viewIdSeq = 0;

var hooks = {
	willCreate: [],
	didCreate: [],
	willInit: [],
	didInit: [],
	willDisplay: [],
	didDisplay: [],
	willPostDisplay: [],
	didPostDisplay: [],
	willRemove: [],
	didRemove: []
};

var defaultConfig = {
	append: "last"
};

// --------- Public APIs --------- //
function hook(name, fun) {
	hooks[name].push(fun);
}

function display(instance, parentEl, config) {
	var self = this;

	const view = instance;

	// if the config is a string, then assume it is the append directive.
	if (typeof config === "string") {
		config = { append: config };
	}
	config = Object.assign({}, defaultConfig, config);
	view.config = config;

	// set the .name, if the instance does not have a name, get it from the constructor if present
	if (view.name == null && view.constructor) {
		view.name = view.constructor.name
	}

	// set the .id, set the unique
	view.id = viewIdSeq++;

	return doCreate(view, config)
		.then(function () {
			return doInit(view, config);
		})
		.then(function () {
			return doDisplay.call(self, view, parentEl, config);
		})
		.then(function () {
			return doPostDisplay(view, config);
		});

}

function empty(els) {
	utils.asArray(els).forEach(function (el) {
		removeEl(el, true); // true to say childrenOnly
	});
}

function remove(els) {
	utils.asArray(els).forEach(function (el) {
		removeEl(el);
	});
}
// --------- /Public APIs --------- //

// will remove a el or its children
function removeEl(el, childrenOnly) {
	childrenOnly = (childrenOnly === true);

	//// First we remove/destory the sub views
	var childrenViewEls = utils.asArray(dom.all(el, ".d-view"));

	// Reverse it to remove/destroy from the leaf
	var viewEls = childrenViewEls.reverse();

	// call doRemove on each view to have the lifecycle performed (willRemove/didRemove, .destroy)
	viewEls.forEach(function (viewEl) {
		if (viewEl._view) {
			doRemove(viewEl._view);
		} else {
			// we should not be here, but somehow it happens in some app code (loggin warnning)
			console.log("MVDOM - WARNING - the following dom element should have a ._view property but it is not? (safe ignore)", viewEl);
			// NOTE: we do not need to remove the dom element as it will be taken care by the logic below (avoiding uncessary dom remove)
		}

	});

	// if it is removing only the children, then, let's make sure that all direct children elements are removed
	// (as the logic above only remove the viewEl)
	if (childrenOnly) {
		// Then, we can remove all of the d.
		while (el.lastChild) {
			el.removeChild(el.lastChild);
		}
	} else {
		// if it is a view, we remove the viewwith doRemove
		if (el._view) {
			doRemove(el._view);
		} else {
			if (el.parentNode) {
				el.parentNode.removeChild(el);
			}
		}
	}

}

// return a promise that resolve with nothing.
function doCreate(view, config) {
	performHook("willCreate", view);

	// Call the view.create
	var p = Promise.resolve(view.create(config));

	return p.then(function (html_or_node) {

		var node = (typeof html_or_node === "string") ? dom.frag(html_or_node) : html_or_node;

		// If we have a fragument
		if (node.nodeType === 11) {
			if (node.childNodes.length > 1) {
				console.log("mvdom - WARNING - view HTML for view", view, "has multiple childNodes, but should have only one. Fallback by taking the first one, but check code.");
			}
			node = node.firstChild;
		}

		// make sure that the node is of time Element
		if (node.nodeType !== 1) {
			throw new Error("el for view " + view.name + " is node of type Element. " + node);
		}

		var viewEl = node;

		// set the view.el and view.el._view
		view.el = viewEl;
		view.el.classList.add("d-view");
		view.el._view = view;

		performHook("didCreate", view);
	});
}

function doInit(view, config) {
	performHook("willInit", view);
	var res;

	if (view.init) {
		res = view.init(config);
	}
	return Promise.resolve(res).then(function () {
		performHook("didInit", view);
	});
}

function doDisplay(view, refEl, config) {
	// if we have a selector, assume it is a selector from document.
	if (typeof refEl === "string") {
		refEl = dom.first(refEl);
	}

	performHook("willDisplay", view);

	try {
		// WORKAROUND: this needs tobe the mvdom, since we have cyclic reference between dom.js and view.js (on empty)
		dom.append.call(this, refEl, view.el, config.append);
	} catch (ex) {
		throw new Error("mvdom ERROR - Cannot add view.el " + view.el + " to refEl " + refEl + ". Cause: " + ex.toString());
	}

	performHook("didDisplay", view);

	return new Promise(function (resolve, fail) {
		setTimeout(function () {
			resolve();
		}, 0);
	});
}

function doPostDisplay(view, config) {
	performHook("willPostDisplay", view);

	var result;
	if (view.postDisplay) {
		result = view.postDisplay(config);
	}

	return Promise.resolve(result).then(function () {
		return view;
	});

}

function doRemove(view) {
	// Note: on willRemove all of the events bound to documents, window, parentElements, hubs will be unbind.
	performHook("willRemove", view);

	// remove it from the DOM
	// NOTE: this means that the detach won't remove the node from the DOM
	//       which avoid removing uncessary node, but means that didDetach will
	//       still have a view.el in the DOM
	var parentEl;
	if (view.el && view.el.parentNode) {
		parentEl = view.el.parentNode;
		view.el.parentNode.removeChild(view.el);
	}

	// we call 
	if (view.destroy) {
		view.destroy({ parentEl: parentEl });
	}

	performHook("didRemove", view);
}


function performHook(name, view) {
	var hookFuns = hooks[name];
	var i = 0, l = hookFuns.length, fun;
	for (; i < l; i++) {
		fun = hookFuns[i];
		fun(view);
	}
}


