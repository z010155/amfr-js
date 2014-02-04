AMFR_CONSTANTS = {
	EMPTY_STRING : "",
	NULL_STRING : "null",
	AMFR_UNDEFINED_TYPE : 0,
	AMFR_NULL_TYPE : 1,
	AMFR_FALSE_TYPE : 2,
	AMFR_TRUE_TYPE : 3,
	AMFR_INTEGER_TYPE : 4,
	AMFR_DOUBLE_TYPE : 5,
	AMFR_STRING_TYPE : 6,
	AMFR_DATE_TYPE : 7,
	AMFR_ARRAY_TYPE : 8,
	AMFR_OBJECT_TYPE : 9,
	AMFR_BYTEARRAY_TYPE : 10,
	AMFR_LIST_TYPE : 11,
	AMFR_SET_TYPE : 12,
	AMFR_MAP_TYPE : 13,
	UINT29_MASK : 536870911,
	INT28_MAX_VALUE : 268435455,
	INT28_MIN_VALUE : -268435456,
	AMFR_ALIAS : "AMFR_class"
};

function AMFMessage() {
	this.AMFR_class = "com.reignite.messaging.amf.AMFMessage";
	this.version = 99;
	this.headers = [];
	this.bodies = [];
}

function AMFMessageBody() {
	this.AMFR_class = "com.reignite.messaging.amf.AMFMessageBody";
	this.targetURI = "";
	this.responseURI = "";
	this.data = [];
}

function AMFMessageHeader() {
	this.AMFR_class = "com.reignite.messaging.amf.AMFMessageBody";
	this.name = "";
	this.mustUnderstand = false;
	this.data = null;
}

function RemotingMessage() {
	this.AMFR_class = "com.reignite.messaging.amfr.RemotingMessage";
	this.destination = "";
	this.operation = "";
	this.parameters = [];
	this.headers = {};
}

/**
 * @returns {DataOutputStream}
 */
function AMFRSerializeWorker() {
	this.out = [];

	this.objects = [];
	this.traits = {};
	this.strings = {};
	this.stringCount = 0;
	this.traitCount = 0;
	this.objectCount = 0;

	this.write = function(value) {
		// "cast" to a byte between -128 and 127
		if (value > 127) {
			value = 383 - value;
		}
		this.out.push(String.fromCharCode(value));
	};

	this.writeShort = function(sh) {
		this.write((sh >>> 8) & 0xFF);
		this.write((sh >>> 0) & 0xFF);
	};
	this.writeUTF = function(str, asAMF) {
		var bytearr, c, i, strlen, utflen;
		strlen = str.length;
		utflen = 0;
		for (i = 0; i < strlen; i++) {
			c = str.charCodeAt(i);
			if (c >= 1 && c <= 127) {
				++utflen;
			} else {
				if (c > 2047) {
					utflen += 3;
				} else {
					utflen += 2;
				}
			}
		}
		bytearr = [];
		if (asAMF) {
			this.writeUInt29((utflen << 1) | 1);
		} else {
			bytearr.push((utflen >>> 8 & 255) << 24 >> 24);
			bytearr.push((utflen & 255) << 24 >> 24);
		}
		for (i = 0; i < strlen; ++i) {
			c = str.charCodeAt(i);
			if (!(c >= 1 && c <= 127)) {
				break;
			}
			bytearr.push(c << 24 >> 24);
		}
		for (; i < strlen; ++i) {
			c = str.charCodeAt(i);
			if (c >= 1 && c <= 127) {
				bytearr.push(c << 24 >> 24);
			} else if (c > 2047) {
				bytearr.push((224 | c >> 12 & 15) << 24 >> 24);
				bytearr.push((128 | c >> 6 & 63) << 24 >> 24);
				bytearr.push((128 | c & 63) << 24 >> 24);
			} else {
				bytearr.push((192 | c >> 6 & 31) << 24 >> 24);
				bytearr.push((128 | c & 63) << 24 >> 24);
			}
		}
		this.writeAll(bytearr, 0, asAMF ? utflen : utflen + 2);
		return asAMF ? utflen : utflen + 2;
	};
	this.writeUInt29 = function(num) {
		if (num < 0x80) {
			this.write(num);
		} else if (num < 0x4000) {
			this.write(((num >> 7) & 0x7F) | 0x80);
			this.write(num & 0x7F);

		} else if (num < 0x200000) {
			this.write(((num >> 14) & 0x7F) | 0x80);
			this.write(((num >> 7) & 0x7F) | 0x80);
			this.write(num & 0x7F);

		} else if (num < 0x40000000) {
			this.write(((num >> 22) & 0x7F) | 0x80);
			this.write(((num >> 15) & 0x7F) | 0x80);
			this.write(((num >> 8) & 0x7F) | 0x80);
			this.write(num & 0xFF);

		} else {
			throw "Integer out of range: " + num;
		}
	};

	this.writeAll = function(bytes, start, length) {
		for ( var i = 0; i < bytes.length; i++) {
			this.write(bytes[i]);
		}
	};
	this.writeBoolean = function(value) {
		this.write(value ? 1 : 0);
	};
	this.writeInt = function(v) {
		this.write((v >>> 24) & 0xFF);
		this.write((v >>> 16) & 0xFF);
		this.write((v >>> 8) & 0xFF);
		this.write((v >>> 0) & 0xFF);
	};
	this.writeDouble = function(v) {
		var bits = parseInt(v);
		var total = 0;
		if (v == 0.0) {
			total = 0;
		} else {
			if (isNaN(v)) {
				total = 0x7ff8000000000000;
			} else if (v == Infinity) {
				total = 0x7ff0000000000000;
			} else if (v == -Infinity) {
				total = 0xfff0000000000000;
			} else {
				if (bits < 0) {
					total = 0x8000000000000000;
					bits = -bits;
				}
				var lastExponent = 0;

				while (bits - Math.pow(2, lastExponent) > 0) {
					lastExponent++;
				}
				var exp = (lastExponent + 1022) * Math.pow(2, 52) + 1;
				var man = v / (Math.pow(2, lastExponent - 1)) - 1;
				var count = 52;
				var out = "";
				while (man > 0 && count > 0) {
					man = man * 2;
					if (man > 1) {
						man--;
						out += "1";
					} else {
						out += "0";
					}
					count--;
				}
				var manLong = out.length == 0 ? 0 : parseInt(out, 2);
				total += exp + manLong;
			}
		}
		this.writeLong(total);
	};
	this.writeLong = function(v) {
		this.write(~~(v / Math.pow(2, 56)) & 0xFF);
		this.write(~~(v / Math.pow(2, 48)) & 0xFF);
		this.write(~~(v / Math.pow(2, 40)) & 0xFF);
		this.write(~~(v / Math.pow(2, 32)) & 0xFF);
		this.write((v >>> 24) & 0xFF);
		this.write((v >>> 16) & 0xFF);
		this.write((v >>> 8) & 0xFF);
		this.write((v >>> 0) & 0xFF);
	};

	this.getResult = function() {
		return this.out.join("");
	};

	this.reset = function() {
		this.objects = [];
		this.objectCount = 0;
		this.traits = {};
		this.traitCount = 0;
		this.strings = {};
		this.stringCount = 0;
	};
	this.writeReferencedUTFString = function(s) {
		if (s.length == 0) {
			this.writeUInt29(1);
		} else {
			if (!this.stringByReference(s)) {
				this.writeUTF(s, true);
			}
		}
	};

	this.stringByReference = function(s) {
		var ref = this.strings[s];

		if (ref) {
			this.writeUInt29(ref << 1);
		} else {
			this.strings[s] = this.stringCount++;
		}

		return ref;
	};

	this.objectByReference = function(obj) {
		var ref = 0;
		var found = false;
		for (; ref < this.objects.length; ref++) {
			if (this.objects[ref] === obj) {
				found = true;
				break;
			}
		}

		if (found) {
			this.writeUInt29(ref << 1);
		} else {
			this.objects.push(obj);
			this.objectCount++;
		}

		return found ? ref : null;
	};
	this.traitsByReference = function(obj, alias) {
		var s = alias + "|";
		for ( var i = 0; i < obj.length; i++) {
			s += obj[i] + "|";
		}
		var ref = this.traits[s];

		if (ref) {
			this.writeUInt29((ref << 2) | 1);
		} else {
			this.traits[s] = this.traitCount++;
		}

		return ref;
	};
	this.writeAMFInt = function(i) {
		if (i >= AMFR_CONSTANTS.INT28_MIN_VALUE
				&& i <= AMFR_CONSTANTS.INT28_MAX_VALUE) {
			i = i & AMFR_CONSTANTS.UINT29_MASK;
			this.write(AMFR_CONSTANTS.AMFR_INTEGER_TYPE);
			this.writeUInt29(i);
		} else {
			this.write(AMFR_CONSTANTS.AMFR_DOUBLE_TYPE);
			this.writeDouble(i);
		}
	};

	this.writeAMFRDate = function(date) {
		this.write(AMFR_CONSTANTS.AMFR_DATE_TYPE);

		if (!this.objectByReference(date)) {
			this.writeUInt29(1);
			this.writeLong(date.getTime());
		}
	};
	this.writeObject = function(obj) {
		if (obj == null) {
			this.write(AMFR_CONSTANTS.AMFR_NULL_TYPE);
			return;
		}

		if (obj.constructor === String) {
			this.write(AMFR_CONSTANTS.AMFR_STRING_TYPE);
			this.writeReferencedUTFString(obj);
		} else if (obj.constructor === Number) {
			if (obj === +obj && obj === (obj | 0)) {
				this.writeAMFInt(obj);
			} else {
				this.write(AMFR_CONSTANTS.AMFR_DOUBLE_TYPE);
				this.writeDouble(obj);
			}
		} else if (obj.constructor === Boolean) {
			this.write((obj ? AMFR_CONSTANTS.AMFR_TRUE_TYPE
					: AMFR_CONSTANTS.AMFR_FALSE_TYPE));
		} else if (obj.constructor === Date) {
			this.writeAMFRDate(obj);
		} else {
			if (obj.constructor === Array) {
				this.writeArray(obj);
			} else if (this.checkArrayBuffer(obj.constructor)) {
				this.writeByteArray(obj);
			} else if (AMFR_CONSTANTS.AMFR_ALIAS in obj) {
				this.writeCustomObject(obj);
			} else {
				this.writeMap(obj);
			}
		}
	};
	
	this.checkArrayBuffer = function(construct) {
		try {
		    var a = new Uint8Array(1);
		    return (construct === ArrayBuffer);
		  } catch(e) {
			  return false;
		  }
	};

	this.writeCustomObject = function(o) {
		this.write(AMFR_CONSTANTS.AMFR_OBJECT_TYPE);
		if (!this.objectByReference(o)) {

			var traits = this.writeTraits(o);
			for ( var i = 0; i < traits.length; i++) {
				var propName = traits[i];
				this.writeObject(o[propName]);
			}
		}
	};
	this.writeTraits = function(o) {
		var traits = [];
		var count = 0;
		var externalizable = false;
		var dynamic = false;

		for ( var k in o) {
			if (k != AMFR_CONSTANTS.AMFR_ALIAS) {
				traits.push(k);
				count++;
			}
		}
		if (!this.traitsByReference(traits, o[AMFR_CONSTANTS.AMFR_ALIAS])) {

			this.writeUInt29(3 | (externalizable ? 4 : 0) | (dynamic ? 8 : 0)
					| (count << 4));
			this.writeReferencedUTFString(o[AMFR_CONSTANTS.AMFR_ALIAS]);

			if (count > 0) {
				for ( var propName in traits) {
					this.writeReferencedUTFString(traits[propName]);
				}
			}
		}
		return traits;
	};

	this.writeMap = function(map) {
		this.write(AMFR_CONSTANTS.AMFR_MAP_TYPE);
		if (!this.objectByReference(map)) {
			var length = 0;
			for ( var key in map) {
				length++;
			}
			this.writeUInt29((length << 1) | 1);
			if (length > 0) {
				for ( var key in map) {
					if (key) {
						this.writeObject(key);
					} else {
						this.writeObject(EMPTY_STRING);
					}
					this.writeObject(map[key]);
				}
				this.write(AMFR_CONSTANTS.AMFR_NULL_TYPE);
			}
		}
	};

	this.writeByteArray = function(arr) {
		this.write(AMFR_CONSTANTS.AMFR_BYTEARRAY_TYPE);
		if (!this.objectByReference(arr)) {
			var int8View = new Uint8Array(arr);

			this.writeUInt29((int8View.byteLength << 1) | 1);
			if (int8View.byteLength > 0) {
				for ( var i = 0; i < int8View.byteLength; i++) {
					this.write(int8View[i]);
				}
			}
		}
	};

	this.writeArray = function(arr) {
		this.write(AMFR_CONSTANTS.AMFR_ARRAY_TYPE);
		if (!this.objectByReference(arr)) {
			this.writeUInt29((arr.length << 1) | 1);
			if (arr.length > 0) {
				for ( var i = 0; i < arr.length; i++) {
					this.writeObject(arr[i]);
				}
			}
		}
	};
}

function AMFMessageSerializer() {
	this.worker = new AMFRSerializeWorker();
	this.writeMessage = function(message) {
		try {
			this.worker.writeShort(message.version);
			this.worker.writeShort(message.headers.length);
			for ( var header in message.headers) {
				this.writeHeader(message.headers[header]);
			}
			this.worker.writeShort(message.bodies.length);
			for ( var body in message.bodies) {
				this.writeBody(message.bodies[body]);
			}
		} catch (error) {
			//console.log(error);
		}
		return this.worker.getResult();
	};

	this.writeObject = function(object) {
		this.worker.writeObject(object);
	};

	this.writeHeader = function(header) {
		this.worker.writeUTF(header.name);
		this.worker.writeBoolean(header.mustUnderstand);
		this.worker.reset();
		writeObject(header.data);
	};

	this.writeBody = function(body) {
		if (body.targetURI == null) {
			this.worker.writeUTF(AMFR_CONSTANTS.NULL_STRING);
		} else {
			this.worker.writeUTF(body.targetURI);
		}

		if (body.responseURI == null) {
			this.worker.writeUTF(AMFR_CONSTANTS.NULL_STRING);
		} else {
			this.worker.writeUTF(body.responseURI);
		}

		this.worker.reset();

		this.writeObject(body.data);
	};

}

function AMFRDeserializeWorker(payload) {
	this.objects = [];
	this.traits = [];
	this.strings = [];
	this.payload = payload;
	this.pos = 0;

	this.read = function() {
		var v = this.payload.charCodeAt(this.pos++);

		var r = v;
		if (r == 33) {
			v = this.payload.charCodeAt(this.pos++);
			if (v == 0) {
				r = -33;
			} else if (v == 33) {
				r = 33;
			} else {
				r = v == 65533 ? -128 : -v;
			}
		}
		return r;
	};

	this.readUnsignedShort = function() {
		var ch1 = this.read();
		var ch2 = this.read();
		return (ch1 << 8) + (ch2 << 0);
	};

	this.readUInt29 = function() {
		// Each byte must be treated as unsigned
		var b = this.read() & 0xFF;

		if (b < 128) {
			return b;
		}

		var value = (b & 0x7F) << 7;
		b = this.read() & 0xFF;

		if (b < 128) {
			return (value | b);
		}

		value = (value | (b & 0x7F)) << 7;
		b = this.read() & 0xFF;

		if (b < 128) {
			return (value | b);
		}

		value = (value | (b & 0x7F)) << 8;
		b = this.read() & 0xFF;

		return (value | b);
	};

	this.readFully = function(buff, start, length) {
		for ( var i = start; i < length; i++) {
			buff[i] = this.read();
		}
	};

	this.readLong = function() {
		var arr = [];
		arr[0] = Long.fromInt(this.read());
		arr[1] = Long.fromInt(this.read());
		arr[2] = Long.fromInt(this.read());
		arr[3] = Long.fromInt(this.read());
		arr[4] = Long.fromInt(this.read());
		arr[5] = Long.fromInt(this.read());
		arr[6] = Long.fromInt(this.read());
		arr[7] = Long.fromInt(this.read());
		
		var twoFiveFive = Long.fromInt(255);
		
		arr[0] = arr[0].shiftLeft(56);
		arr[1] = arr[1].and(twoFiveFive).shiftLeft(48);
		arr[2] = arr[2].and(twoFiveFive).shiftLeft(40);
		arr[3] = arr[3].and(twoFiveFive).shiftLeft(32);
		arr[4] = arr[4].and(twoFiveFive).shiftLeft(24);
		arr[5] = arr[5].and(twoFiveFive).shiftLeft(16);
		arr[6] = arr[6].and(twoFiveFive).shiftLeft(8);
		arr[7] = arr[7].and(twoFiveFive).shiftLeft(0);
		return arr[0].add(arr[1]).add(arr[2]).add(arr[3]).add(arr[4]).add(
				arr[5]).add(arr[6]).add(arr[7]).toNumber();
	};

	this.readUTF = function(length) {
		var utflen = length ? length : this.readUnsignedShort();
		var bytearr = [ utflen ];
		var chararr = [ utflen ];

		var c, char2, char3;
		var count = 0;
		var chararr_count = 0;

		this.readFully(bytearr, 0, utflen);

		while (count < utflen) {
			c = bytearr[count] & 0xff;
			if (c > 127) {
				break;
			}
			count++;
			chararr[chararr_count++] = String.fromCharCode(c);
		}

		while (count < utflen) {
			c = bytearr[count] & 0xff;
			switch (c >> 4) {
			case 0:
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
				count++;
				chararr[chararr_count++] = String.fromCharCode(c);
				break;
			case 12:
			case 13:
				count += 2;
				char2 = bytearr[count - 1];
				chararr[chararr_count++] = String
						.fromCharCode((((c & 0x1F) << 6) | (char2 & 0x3F)));
				break;
			case 14:
				count += 3;
				char2 = bytearr[count - 2];
				char3 = bytearr[count - 1];
				chararr[chararr_count++] = String
						.fromCharCode((((c & 0x0F) << 12)
								| ((char2 & 0x3F) << 6) | ((char3 & 0x3F) << 0)));
				break;
			default:
				throw "malformed input around byte " + count;
			}
		}
		// The number of chars produced may be less than utflen
		return chararr.slice(0, chararr_count).join("");
	};

	this.reset = function() {
		this.objects = [];
		this.traits = [];
		this.strings = [];
	};

	this.readObject = function() {
		var type = this.read();
		var value = this.readObjectValue(type);
		return value;
	};

	this.readString = function() {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getString(ref >> 1);
		} else {
			var len = (ref >> 1);

			if (0 == len) {
				return AMFR_CONSTANTS.EMPTY_STRING;
			}

			var str = this.readUTF(len);

			this.rememberString(str);

			return str;
		}
	};

	this.rememberString = function(str) {
		this.strings.push(str);
	};

	this.getString = function(ref) {
		return this.strings[ref];
	};

	this.getObject = function(ref) {
		return this.objects[ref];
	};

	this.getTraits = function(ref) {
		return this.traits[ref];
	};

	this.rememberTraits = function(traits) {
		this.traits.push(traits);
	};

	this.rememberObject = function(obj) {
		this.objects.push(obj);
	};

	this.readTraits = function(ref) {
		if ((ref & 3) == 1) {
			return this.getTraits(ref >> 2);
		} else {
			var count = (ref >> 4);
			var className = this.readString();
			var traits = {};
			traits[AMFR_CONSTANTS.AMFR_ALIAS] = className;
			traits.props = [];
			for ( var i = 0; i < count; i++) {
				traits.props.push(this.readString());
			}
			this.rememberTraits(traits);

			return traits;
		}
	};

	this.readTypedObject = function() {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getObject(ref >> 1);
		} else {
			var traits = this.readTraits(ref);
			var obj = {};
			obj[AMFR_CONSTANTS.AMFR_ALIAS] = traits[AMFR_CONSTANTS.AMFR_ALIAS];
			this.rememberObject(obj);
			for ( var i in traits.props) {
				var value = this.readObject();
				obj[traits.props[i]] = value;
			}

			return obj;
		}
	};

	this.readArray = function(type) {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getObject(ref >> 1);
		}
		
		var len = (ref >> 1);
		var array = null;
		if (type == AMFR_CONSTANTS.AMFR_LIST_TYPE || type == AMFR_CONSTANTS.AMFR_SET_TYPE){
			array = [];
			this.rememberObject(array);
		}
		if (len > 0) {
			array = [];
			for ( var i = 0; i < len; i++) {
				var item = this.readObject();
				array.push(item);
			}
			if (type == AMFR_CONSTANTS.AMFR_ARRAY_TYPE){
				this.rememberObject(array);
			}
		}
		return array;
	};

	this.readDouble = function() {
		var bits = this.readLong();
		if ((bits >= 0x7ff0000000000001 && bits <= 0x7fffffffffffffff)
				|| (bits >= 0xfff0000000000001 && bits <= 0xffffffffffffffff)) {
			return NaN;
		}

		var sLongBits = Long.fromNumber(bits);
		var eLongBits = Long.fromNumber(bits);
		var mLongBits = Long.fromNumber(bits);
		sLongBits = sLongBits.shiftRight(63);
		eLongBits = eLongBits.shiftRight(52);
		var mLongAnd = Long.fromNumber(0xfffffffffffff);
		mLongBits = mLongBits.and(mLongAnd);
		var e = eLongBits.toNumber() & 0x7ff;
		if (e == 0) {
			mLongBits = mLongBits.shiftLeft(1);
		} else {
			mLongBits = mLongBits.or(Long.fromNumber(0x10000000000000));
		}
		var s = sLongBits.toNumber() == 0 ? 1 : -1;
		var m = mLongBits.toNumber();
		var d = Math.pow(2, (e - 1075));

		var theDouble = s * m * d;
		return theDouble;
	};

	this.readDate = function() {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getObject(ref >> 1);
		}
		var time = this.readLong();

		var d = new Date(time);
		this.rememberObject(d);

		return d;
	};

	this.readMap = function() {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getObject(ref >> 1);
		}
		var length = (ref >> 1);

		var map = null;
		if (length > 0) {
			map = {};
			this.rememberObject(map);
			var name = this.readObject();
			while (name != null) {
				if (typeof name === 'object') {
					name = JSON.stringify(name);
				}

				var value = this.readObject();
				map[name] = value;
				name = this.readObject();
			}
		}

		return map;
	};

	this.readByteArray = function() {
		var ref = this.readUInt29();

		if ((ref & 1) == 0) {
			return this.getObject(ref >> 1);
		} else {
			var len = (ref >> 1);

			var ba = [];
			this.readFully(ba, 0, len);
			this.rememberObject(ba);

			return ba;
		}
	};

	this.readObjectValue = function(type) {
		var value = null;

		switch (type) {
		case AMFR_CONSTANTS.AMFR_STRING_TYPE:
			value = this.readString();
			break;
		case AMFR_CONSTANTS.AMFR_OBJECT_TYPE:
			try {
				value = this.readTypedObject();
			} catch (e) {
				throw "Failed to deserialised." + e;
			}
			break;
		case AMFR_CONSTANTS.AMFR_ARRAY_TYPE:
		case AMFR_CONSTANTS.AMFR_LIST_TYPE:
		case AMFR_CONSTANTS.AMFR_SET_TYPE:
			value = this.readArray(type);
			break;
		case AMFR_CONSTANTS.AMFR_FALSE_TYPE:
			value = false;
			break;
		case AMFR_CONSTANTS.AMFR_TRUE_TYPE:
			value = true;
			break;
		case AMFR_CONSTANTS.AMFR_INTEGER_TYPE:
			value = this.readUInt29();
			// Symmetric with writing an integer to fix sign bits for
			// negative values...
			value = (value << 3) >> 3;
			break;
		case AMFR_CONSTANTS.AMFR_DOUBLE_TYPE:
			value = this.readDouble();
			break;
		case AMFR_CONSTANTS.AMFR_UNDEFINED_TYPE:
		case AMFR_CONSTANTS.AMFR_NULL_TYPE:
			break;
		case AMFR_CONSTANTS.AMFR_DATE_TYPE:
			value = this.readDate();
			break;
		case AMFR_CONSTANTS.AMFR_BYTEARRAY_TYPE:
			value = this.readByteArray();
			break;
		case AMFR_CONSTANTS.AMFR_MAP_TYPE:
			value = this.readMap();
			break;
		default:
			throw "Unknown object type: " + type;
		}
		return value;
	};

	this.readBoolean = function() {
		return this.read() === 1;
	};
}

function AMFMessageDeserializer(payload) {
	this.worker = new AMFRDeserializeWorker(payload);

	this.readMessage = function() {
		var message = new AMFMessage();
		var version = this.worker.readUnsignedShort();
		message.version = version;
		var headerCount = this.worker.readUnsignedShort();
		for ( var i = 0; i < headerCount; i++) {
			message.headers.push(this.readHeader());
		}

		var bodyCount = this.worker.readUnsignedShort();
		for (i = 0; i < bodyCount; i++) {
			message.bodies.push(this.readBody());
		}
		return message;
	};

	this.readHeader = function() {
		var header = new AMFMessageHeader();
		var name = this.worker.readUTF();
		header.name = name;
		var mustUnderstand = this.worker.readBoolean();
		header.mustUnderstand = mustUnderstand;

		this.worker.reset();
		var data = this.readObject();

		header.data = data;
		return header;
	};

	this.readBody = function() {
		var body = new AMFMessageBody();
		var targetURI = this.worker.readUTF();
		body.targetURI = targetURI;
		var responseURI = this.worker.readUTF();
		body.responseURI = responseURI;

		this.worker.reset();
		var data = this.readObject();

		body.data = data;
		return body;
	};

	this.readObject = function() {
		return this.worker.readObject();
	};
}

function AMFR() {
	this.version = 1.5; // compatible with ramf-1.2.jar
	this.endpoint = "";
	this.headers = [];

	this.addHeader = function(name, value) {
		var header = {};
		header[name] = value;
		this.headers.push(header);
	};

	this.createMessage = function(destination, operation, params) {
		var amfMessage = new AMFMessage();
		var amfMessageBody = new AMFMessageBody();
		var remotingMessage = new RemotingMessage();
		remotingMessage.destination = destination;
		remotingMessage.operation = operation;
		remotingMessage.parameters = params;

		for ( var i = 0; i < this.headers.length; i++) {
			var header = this.headers[i];
			for ( var headerName in header) {
				remotingMessage.headers[headerName] = header[headerName];
			}
		}

		amfMessageBody.data.push(remotingMessage);
		amfMessage.bodies.push(amfMessageBody);
		var serializer = new AMFMessageSerializer();
		return serializer.writeMessage(amfMessage);
	};

	this.call = function(message, onResult, onStatus) {
		var req = this.getXmlHttp();
		req.message = message;
		req.doneSend = false;
		req.onreadystatechange = function() {
			if (req.readyState === 1) {
				if (!this.doneSend) {
					this.doneSend = true;
					req.setRequestHeader("s-enc", "true");
					req.setRequestHeader("Content-Type",
							"application/x-amf; charset=UTF-8");
					req.send(this.message);
				}
			} else if (req.readyState === 4) {
				var res = req.responseText;

				var deserializer = new AMFMessageDeserializer(res);
				var message = deserializer.readMessage();
				for ( var bodyIndex in message.bodies) {
					var body = message.bodies[bodyIndex];
					if (body.targetURI
							&& body.targetURI.indexOf("/onResult") > -1) {
						onResult(body.data);
					} else {
						onStatus(body.data);
					}
					//console.log(body);
				}
			}
		};
		req.open("POST", this.endpoint, true);
	};

	this.getXmlHttp = function() {
		if (XMLHttpRequest) {
			return new XMLHttpRequest();
		} else {
			try {
				return new ActiveXObject("MSXML2.XMLHTTP.3.0");
			} catch (e) {
				return new ActiveXObject("Microsoft.XMLHTTP");
			}
		}
	};
};

Long = function(low, high) {
	this.low_ = low | 0; // force into 32 signed bits.
	this.high_ = high | 0; // force into 32 signed bits.
};

Long.IntCache_ = {};

Long.fromInt = function(value) {
	if (-128 <= value && value < 128) {
		var cachedObj = Long.IntCache_[value];
		if (cachedObj) {
			return cachedObj;
		}
	}

	var obj = new Long(value | 0, value < 0 ? -1 : 0);
	if (-128 <= value && value < 128) {
		Long.IntCache_[value] = obj;
	}
	return obj;
};

Long.fromNumber = function(value) {
	if (isNaN(value) || !isFinite(value)) {
		return Long.ZERO;
	} else if (value <= -Long.TWO_PWR_63_DBL_) {
		return Long.MIN_VALUE;
	} else if (value + 1 >= Long.TWO_PWR_63_DBL_) {
		return Long.MAX_VALUE;
	} else if (value < 0) {
		return Long.fromNumber(-value).negate();
	} else {
		return new Long((value % Long.TWO_PWR_32_DBL_) | 0,
				(value / Long.TWO_PWR_32_DBL_) | 0);
	}
};

Long.fromBits = function(lowBits, highBits) {
	return new Long(lowBits, highBits);
};

Long.TWO_PWR_16_DBL_ = 1 << 16;
Long.TWO_PWR_24_DBL_ = 1 << 24;
Long.TWO_PWR_32_DBL_ = Long.TWO_PWR_16_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_31_DBL_ = Long.TWO_PWR_32_DBL_ / 2;
Long.TWO_PWR_48_DBL_ = Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_16_DBL_;
Long.TWO_PWR_64_DBL_ = Long.TWO_PWR_32_DBL_ * Long.TWO_PWR_32_DBL_;
Long.TWO_PWR_63_DBL_ = Long.TWO_PWR_64_DBL_ / 2;
Long.ZERO = Long.fromInt(0);
Long.ONE = Long.fromInt(1);
Long.NEG_ONE = Long.fromInt(-1);
Long.MAX_VALUE = Long.fromBits(0xFFFFFFFF | 0, 0x7FFFFFFF | 0);
Long.MIN_VALUE = Long.fromBits(0, 0x80000000 | 0);
Long.TWO_PWR_24_ = Long.fromInt(1 << 24);

Long.prototype.toNumber = function() {
	return this.high_ * Long.TWO_PWR_32_DBL_
			+ ((this.low_ >= 0) ? this.low_ : Long.TWO_PWR_32_DBL_ + this.low_);
};
Long.prototype.negate = function() {
	if (this.equals(Long.MIN_VALUE)) {
		return Long.MIN_VALUE;
	} else {
		return this.not().add(Long.ONE);
	}
};
Long.prototype.add = function(other) {
	// Divide each number into 4 chunks of 16 bits, and then sum the chunks.

	var a48 = this.high_ >>> 16;
	var a32 = this.high_ & 0xFFFF;
	var a16 = this.low_ >>> 16;
	var a00 = this.low_ & 0xFFFF;

	var b48 = other.high_ >>> 16;
	var b32 = other.high_ & 0xFFFF;
	var b16 = other.low_ >>> 16;
	var b00 = other.low_ & 0xFFFF;

	var c48 = 0, c32 = 0, c16 = 0, c00 = 0;
	c00 += a00 + b00;
	c16 += c00 >>> 16;
	c00 &= 0xFFFF;
	c16 += a16 + b16;
	c32 += c16 >>> 16;
	c16 &= 0xFFFF;
	c32 += a32 + b32;
	c48 += c32 >>> 16;
	c32 &= 0xFFFF;
	c48 += a48 + b48;
	c48 &= 0xFFFF;
	return Long.fromBits((c16 << 16) | c00, (c48 << 16) | c32);
};
Long.prototype.equals = function(other) {
	return (this.high_ == other.high_) && (this.low_ == other.low_);
};
Long.prototype.not = function() {
	return Long.fromBits(~this.low_, ~this.high_);
};
Long.prototype.shiftLeft = function(numBits) {
	numBits &= 63;
	if (numBits == 0) {
		return this;
	} else {
		var low = this.low_;
		if (numBits < 32) {
			var high = this.high_;
			return Long.fromBits(low << numBits, (high << numBits)
					| (low >>> (32 - numBits)));
		} else {
			return Long.fromBits(0, low << (numBits - 32));
		}
	}
};
Long.prototype.shiftRight = function(numBits) {
	numBits &= 63;
	if (numBits == 0) {
		return this;
	} else {
		var high = this.high_;
		if (numBits < 32) {
			var low = this.low_;
			return Long.fromBits((low >>> numBits) | (high << (32 - numBits)),
					high >> numBits);
		} else {
			return Long.fromBits(high >> (numBits - 32), high >= 0 ? 0 : -1);
		}
	}
};
Long.prototype.and = function(other) {
	return Long.fromBits(this.low_ & other.low_, this.high_ & other.high_);
};
Long.prototype.or = function(other) {
	return Long.fromBits(this.low_ | other.low_, this.high_ | other.high_);
};
