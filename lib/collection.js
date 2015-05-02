function isFunction(obj) {
	return !!(obj && obj.constructor && obj.call && obj.apply);
}

function Collection(funcHash, funcEqual) {
	this.db = {};

	if (!isFunction(funcHash)) {
		throw 'funcHash should not be empty';
	} else {
		this.funcHash = funcHash;
	}

	if (!isFunction(funcEqual)) {
		this.funcEqual = function (left, right) {
			return left === right;
		};
	} else {
		this.funcEqual = funcEqual;
	}
}

Collection.prototype.contains = function (item) {
	var subset = this.db[this.funcHash(item)];
	if (typeof subset !== 'undefined') {
		for (var is in subset) {
			if (this.funcEqual(item, subset[is])) {
				return true;
			}
		}
	}
	return false;
};

Collection.prototype.add = function (item) {
	if (!this.contains(item)) {
		if (typeof this.db[this.funcHash(item)] === 'undefined') {
			//	create new one
			this.db[this.funcHash(item)] = [item];
		} else {
			this.db[this.funcHash(item)].push(item);
		}
	}
};

Collection.prototype.addAll = function (items) {
	for (var index in items) {
		this.add(items[index]);
	}
}

module.exports = Collection;
