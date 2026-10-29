import { createServer } from "node:http";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { execFile, spawn } from "node:child_process";
//#region node_modules/zod/v3/helpers/util.js
var util;
(function(util) {
	util.assertEqual = (_) => {};
	function assertIs(_arg) {}
	util.assertIs = assertIs;
	function assertNever(_x) {
		throw new Error();
	}
	util.assertNever = assertNever;
	util.arrayToEnum = (items) => {
		const obj = {};
		for (const item of items) obj[item] = item;
		return obj;
	};
	util.getValidEnumValues = (obj) => {
		const validKeys = util.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
		const filtered = {};
		for (const k of validKeys) filtered[k] = obj[k];
		return util.objectValues(filtered);
	};
	util.objectValues = (obj) => {
		return util.objectKeys(obj).map(function(e) {
			return obj[e];
		});
	};
	util.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
		const keys = [];
		for (const key in object) if (Object.prototype.hasOwnProperty.call(object, key)) keys.push(key);
		return keys;
	};
	util.find = (arr, checker) => {
		for (const item of arr) if (checker(item)) return item;
	};
	util.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
	function joinValues(array, separator = " | ") {
		return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
	}
	util.joinValues = joinValues;
	util.jsonStringifyReplacer = (_, value) => {
		if (typeof value === "bigint") return value.toString();
		return value;
	};
})(util || (util = {}));
var objectUtil;
(function(objectUtil) {
	objectUtil.mergeShapes = (first, second) => {
		return {
			...first,
			...second
		};
	};
})(objectUtil || (objectUtil = {}));
var ZodParsedType = util.arrayToEnum([
	"string",
	"nan",
	"number",
	"integer",
	"float",
	"boolean",
	"date",
	"bigint",
	"symbol",
	"function",
	"undefined",
	"null",
	"array",
	"object",
	"unknown",
	"promise",
	"void",
	"never",
	"map",
	"set"
]);
var getParsedType = (data) => {
	switch (typeof data) {
		case "undefined": return ZodParsedType.undefined;
		case "string": return ZodParsedType.string;
		case "number": return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
		case "boolean": return ZodParsedType.boolean;
		case "function": return ZodParsedType.function;
		case "bigint": return ZodParsedType.bigint;
		case "symbol": return ZodParsedType.symbol;
		case "object":
			if (Array.isArray(data)) return ZodParsedType.array;
			if (data === null) return ZodParsedType.null;
			if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") return ZodParsedType.promise;
			if (typeof Map !== "undefined" && data instanceof Map) return ZodParsedType.map;
			if (typeof Set !== "undefined" && data instanceof Set) return ZodParsedType.set;
			if (typeof Date !== "undefined" && data instanceof Date) return ZodParsedType.date;
			return ZodParsedType.object;
		default: return ZodParsedType.unknown;
	}
};
//#endregion
//#region node_modules/zod/v3/ZodError.js
var ZodIssueCode = util.arrayToEnum([
	"invalid_type",
	"invalid_literal",
	"custom",
	"invalid_union",
	"invalid_union_discriminator",
	"invalid_enum_value",
	"unrecognized_keys",
	"invalid_arguments",
	"invalid_return_type",
	"invalid_date",
	"invalid_string",
	"too_small",
	"too_big",
	"invalid_intersection_types",
	"not_multiple_of",
	"not_finite"
]);
var ZodError = class ZodError extends Error {
	get errors() {
		return this.issues;
	}
	constructor(issues) {
		super();
		this.issues = [];
		this.addIssue = (sub) => {
			this.issues = [...this.issues, sub];
		};
		this.addIssues = (subs = []) => {
			this.issues = [...this.issues, ...subs];
		};
		const actualProto = new.target.prototype;
		if (Object.setPrototypeOf) Object.setPrototypeOf(this, actualProto);
		else this.__proto__ = actualProto;
		this.name = "ZodError";
		this.issues = issues;
	}
	format(_mapper) {
		const mapper = _mapper || function(issue) {
			return issue.message;
		};
		const fieldErrors = { _errors: [] };
		const processError = (error) => {
			for (const issue of error.issues) if (issue.code === "invalid_union") issue.unionErrors.map(processError);
			else if (issue.code === "invalid_return_type") processError(issue.returnTypeError);
			else if (issue.code === "invalid_arguments") processError(issue.argumentsError);
			else if (issue.path.length === 0) fieldErrors._errors.push(mapper(issue));
			else {
				let curr = fieldErrors;
				let i = 0;
				while (i < issue.path.length) {
					const el = issue.path[i];
					if (!(i === issue.path.length - 1)) curr[el] = curr[el] || { _errors: [] };
					else {
						curr[el] = curr[el] || { _errors: [] };
						curr[el]._errors.push(mapper(issue));
					}
					curr = curr[el];
					i++;
				}
			}
		};
		processError(this);
		return fieldErrors;
	}
	static assert(value) {
		if (!(value instanceof ZodError)) throw new Error(`Not a ZodError: ${value}`);
	}
	toString() {
		return this.message;
	}
	get message() {
		return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
	}
	get isEmpty() {
		return this.issues.length === 0;
	}
	flatten(mapper = (issue) => issue.message) {
		const fieldErrors = {};
		const formErrors = [];
		for (const sub of this.issues) if (sub.path.length > 0) {
			const firstEl = sub.path[0];
			fieldErrors[firstEl] = fieldErrors[firstEl] || [];
			fieldErrors[firstEl].push(mapper(sub));
		} else formErrors.push(mapper(sub));
		return {
			formErrors,
			fieldErrors
		};
	}
	get formErrors() {
		return this.flatten();
	}
};
ZodError.create = (issues) => {
	return new ZodError(issues);
};
//#endregion
//#region node_modules/zod/v3/locales/en.js
var errorMap = (issue, _ctx) => {
	let message;
	switch (issue.code) {
		case ZodIssueCode.invalid_type:
			if (issue.received === ZodParsedType.undefined) message = "Required";
			else message = `Expected ${issue.expected}, received ${issue.received}`;
			break;
		case ZodIssueCode.invalid_literal:
			message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
			break;
		case ZodIssueCode.unrecognized_keys:
			message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
			break;
		case ZodIssueCode.invalid_union:
			message = `Invalid input`;
			break;
		case ZodIssueCode.invalid_union_discriminator:
			message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
			break;
		case ZodIssueCode.invalid_enum_value:
			message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
			break;
		case ZodIssueCode.invalid_arguments:
			message = `Invalid function arguments`;
			break;
		case ZodIssueCode.invalid_return_type:
			message = `Invalid function return type`;
			break;
		case ZodIssueCode.invalid_date:
			message = `Invalid date`;
			break;
		case ZodIssueCode.invalid_string:
			if (typeof issue.validation === "object") if ("includes" in issue.validation) {
				message = `Invalid input: must include "${issue.validation.includes}"`;
				if (typeof issue.validation.position === "number") message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
			} else if ("startsWith" in issue.validation) message = `Invalid input: must start with "${issue.validation.startsWith}"`;
			else if ("endsWith" in issue.validation) message = `Invalid input: must end with "${issue.validation.endsWith}"`;
			else util.assertNever(issue.validation);
			else if (issue.validation !== "regex") message = `Invalid ${issue.validation}`;
			else message = "Invalid";
			break;
		case ZodIssueCode.too_small:
			if (issue.type === "array") message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
			else if (issue.type === "string") message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
			else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
			else if (issue.type === "bigint") message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
			else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
			else message = "Invalid input";
			break;
		case ZodIssueCode.too_big:
			if (issue.type === "array") message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
			else if (issue.type === "string") message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
			else if (issue.type === "number") message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
			else if (issue.type === "bigint") message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
			else if (issue.type === "date") message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
			else message = "Invalid input";
			break;
		case ZodIssueCode.custom:
			message = `Invalid input`;
			break;
		case ZodIssueCode.invalid_intersection_types:
			message = `Intersection results could not be merged`;
			break;
		case ZodIssueCode.not_multiple_of:
			message = `Number must be a multiple of ${issue.multipleOf}`;
			break;
		case ZodIssueCode.not_finite:
			message = "Number must be finite";
			break;
		default:
			message = _ctx.defaultError;
			util.assertNever(issue);
	}
	return { message };
};
//#endregion
//#region node_modules/zod/v3/errors.js
var overrideErrorMap = errorMap;
function getErrorMap() {
	return overrideErrorMap;
}
//#endregion
//#region node_modules/zod/v3/helpers/parseUtil.js
var makeIssue = (params) => {
	const { data, path, errorMaps, issueData } = params;
	const fullPath = [...path, ...issueData.path || []];
	const fullIssue = {
		...issueData,
		path: fullPath
	};
	if (issueData.message !== void 0) return {
		...issueData,
		path: fullPath,
		message: issueData.message
	};
	let errorMessage = "";
	const maps = errorMaps.filter((m) => !!m).slice().reverse();
	for (const map of maps) errorMessage = map(fullIssue, {
		data,
		defaultError: errorMessage
	}).message;
	return {
		...issueData,
		path: fullPath,
		message: errorMessage
	};
};
function addIssueToContext(ctx, issueData) {
	const overrideMap = getErrorMap();
	const issue = makeIssue({
		issueData,
		data: ctx.data,
		path: ctx.path,
		errorMaps: [
			ctx.common.contextualErrorMap,
			ctx.schemaErrorMap,
			overrideMap,
			overrideMap === errorMap ? void 0 : errorMap
		].filter((x) => !!x)
	});
	ctx.common.issues.push(issue);
}
var ParseStatus = class ParseStatus {
	constructor() {
		this.value = "valid";
	}
	dirty() {
		if (this.value === "valid") this.value = "dirty";
	}
	abort() {
		if (this.value !== "aborted") this.value = "aborted";
	}
	static mergeArray(status, results) {
		const arrayValue = [];
		for (const s of results) {
			if (s.status === "aborted") return INVALID;
			if (s.status === "dirty") status.dirty();
			arrayValue.push(s.value);
		}
		return {
			status: status.value,
			value: arrayValue
		};
	}
	static async mergeObjectAsync(status, pairs) {
		const syncPairs = [];
		for (const pair of pairs) {
			const key = await pair.key;
			const value = await pair.value;
			syncPairs.push({
				key,
				value
			});
		}
		return ParseStatus.mergeObjectSync(status, syncPairs);
	}
	static mergeObjectSync(status, pairs) {
		const finalObject = {};
		for (const pair of pairs) {
			const { key, value } = pair;
			if (key.status === "aborted") return INVALID;
			if (value.status === "aborted") return INVALID;
			if (key.status === "dirty") status.dirty();
			if (value.status === "dirty") status.dirty();
			if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) finalObject[key.value] = value.value;
		}
		return {
			status: status.value,
			value: finalObject
		};
	}
};
var INVALID = Object.freeze({ status: "aborted" });
var DIRTY = (value) => ({
	status: "dirty",
	value
});
var OK = (value) => ({
	status: "valid",
	value
});
var isAborted = (x) => x.status === "aborted";
var isDirty = (x) => x.status === "dirty";
var isValid = (x) => x.status === "valid";
var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;
//#endregion
//#region node_modules/zod/v3/helpers/errorUtil.js
var errorUtil;
(function(errorUtil) {
	errorUtil.errToObj = (message) => typeof message === "string" ? { message } : message || {};
	errorUtil.toString = (message) => typeof message === "string" ? message : message?.message;
})(errorUtil || (errorUtil = {}));
//#endregion
//#region node_modules/zod/v3/types.js
var ParseInputLazyPath = class {
	constructor(parent, value, path, key) {
		this._cachedPath = [];
		this.parent = parent;
		this.data = value;
		this._path = path;
		this._key = key;
	}
	get path() {
		if (!this._cachedPath.length) if (Array.isArray(this._key)) this._cachedPath.push(...this._path, ...this._key);
		else this._cachedPath.push(...this._path, this._key);
		return this._cachedPath;
	}
};
var handleResult = (ctx, result) => {
	if (isValid(result)) return {
		success: true,
		data: result.value
	};
	else {
		if (!ctx.common.issues.length) throw new Error("Validation failed but no issues detected.");
		return {
			success: false,
			get error() {
				if (this._error) return this._error;
				const error = new ZodError(ctx.common.issues);
				this._error = error;
				return this._error;
			}
		};
	}
};
function processCreateParams(params) {
	if (!params) return {};
	const { errorMap, invalid_type_error, required_error, description } = params;
	if (errorMap && (invalid_type_error || required_error)) throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
	if (errorMap) return {
		errorMap,
		description
	};
	const customMap = (iss, ctx) => {
		const { message } = params;
		if (iss.code === "invalid_enum_value") return { message: message ?? ctx.defaultError };
		if (typeof ctx.data === "undefined") return { message: message ?? required_error ?? ctx.defaultError };
		if (iss.code !== "invalid_type") return { message: ctx.defaultError };
		return { message: message ?? invalid_type_error ?? ctx.defaultError };
	};
	return {
		errorMap: customMap,
		description
	};
}
var ZodType = class {
	get description() {
		return this._def.description;
	}
	_getType(input) {
		return getParsedType(input.data);
	}
	_getOrReturnCtx(input, ctx) {
		return ctx || {
			common: input.parent.common,
			data: input.data,
			parsedType: getParsedType(input.data),
			schemaErrorMap: this._def.errorMap,
			path: input.path,
			parent: input.parent
		};
	}
	_processInputParams(input) {
		return {
			status: new ParseStatus(),
			ctx: {
				common: input.parent.common,
				data: input.data,
				parsedType: getParsedType(input.data),
				schemaErrorMap: this._def.errorMap,
				path: input.path,
				parent: input.parent
			}
		};
	}
	_parseSync(input) {
		const result = this._parse(input);
		if (isAsync(result)) throw new Error("Synchronous parse encountered promise.");
		return result;
	}
	_parseAsync(input) {
		const result = this._parse(input);
		return Promise.resolve(result);
	}
	parse(data, params) {
		const result = this.safeParse(data, params);
		if (result.success) return result.data;
		throw result.error;
	}
	safeParse(data, params) {
		const ctx = {
			common: {
				issues: [],
				async: params?.async ?? false,
				contextualErrorMap: params?.errorMap
			},
			path: params?.path || [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		return handleResult(ctx, this._parseSync({
			data,
			path: ctx.path,
			parent: ctx
		}));
	}
	"~validate"(data) {
		const ctx = {
			common: {
				issues: [],
				async: !!this["~standard"].async
			},
			path: [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		if (!this["~standard"].async) try {
			const result = this._parseSync({
				data,
				path: [],
				parent: ctx
			});
			return isValid(result) ? { value: result.value } : { issues: ctx.common.issues };
		} catch (err) {
			if (err?.message?.toLowerCase()?.includes("encountered")) this["~standard"].async = true;
			ctx.common = {
				issues: [],
				async: true
			};
		}
		return this._parseAsync({
			data,
			path: [],
			parent: ctx
		}).then((result) => isValid(result) ? { value: result.value } : { issues: ctx.common.issues });
	}
	async parseAsync(data, params) {
		const result = await this.safeParseAsync(data, params);
		if (result.success) return result.data;
		throw result.error;
	}
	async safeParseAsync(data, params) {
		const ctx = {
			common: {
				issues: [],
				contextualErrorMap: params?.errorMap,
				async: true
			},
			path: params?.path || [],
			schemaErrorMap: this._def.errorMap,
			parent: null,
			data,
			parsedType: getParsedType(data)
		};
		const maybeAsyncResult = this._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
		return handleResult(ctx, await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult)));
	}
	refine(check, message) {
		const getIssueProperties = (val) => {
			if (typeof message === "string" || typeof message === "undefined") return { message };
			else if (typeof message === "function") return message(val);
			else return message;
		};
		return this._refinement((val, ctx) => {
			const result = check(val);
			const setError = () => ctx.addIssue({
				code: ZodIssueCode.custom,
				...getIssueProperties(val)
			});
			if (typeof Promise !== "undefined" && result instanceof Promise) return result.then((data) => {
				if (!data) {
					setError();
					return false;
				} else return true;
			});
			if (!result) {
				setError();
				return false;
			} else return true;
		});
	}
	refinement(check, refinementData) {
		return this._refinement((val, ctx) => {
			if (!check(val)) {
				ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
				return false;
			} else return true;
		});
	}
	_refinement(refinement) {
		return new ZodEffects({
			schema: this,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect: {
				type: "refinement",
				refinement
			}
		});
	}
	superRefine(refinement) {
		return this._refinement(refinement);
	}
	constructor(def) {
		/** Alias of safeParseAsync */
		this.spa = this.safeParseAsync;
		this._def = def;
		this.parse = this.parse.bind(this);
		this.safeParse = this.safeParse.bind(this);
		this.parseAsync = this.parseAsync.bind(this);
		this.safeParseAsync = this.safeParseAsync.bind(this);
		this.spa = this.spa.bind(this);
		this.refine = this.refine.bind(this);
		this.refinement = this.refinement.bind(this);
		this.superRefine = this.superRefine.bind(this);
		this.optional = this.optional.bind(this);
		this.nullable = this.nullable.bind(this);
		this.nullish = this.nullish.bind(this);
		this.array = this.array.bind(this);
		this.promise = this.promise.bind(this);
		this.or = this.or.bind(this);
		this.and = this.and.bind(this);
		this.transform = this.transform.bind(this);
		this.brand = this.brand.bind(this);
		this.default = this.default.bind(this);
		this.catch = this.catch.bind(this);
		this.describe = this.describe.bind(this);
		this.pipe = this.pipe.bind(this);
		this.readonly = this.readonly.bind(this);
		this.isNullable = this.isNullable.bind(this);
		this.isOptional = this.isOptional.bind(this);
		this["~standard"] = {
			version: 1,
			vendor: "zod",
			validate: (data) => this["~validate"](data)
		};
	}
	optional() {
		return ZodOptional.create(this, this._def);
	}
	nullable() {
		return ZodNullable.create(this, this._def);
	}
	nullish() {
		return this.nullable().optional();
	}
	array() {
		return ZodArray.create(this);
	}
	promise() {
		return ZodPromise.create(this, this._def);
	}
	or(option) {
		return ZodUnion.create([this, option], this._def);
	}
	and(incoming) {
		return ZodIntersection.create(this, incoming, this._def);
	}
	transform(transform) {
		return new ZodEffects({
			...processCreateParams(this._def),
			schema: this,
			typeName: ZodFirstPartyTypeKind.ZodEffects,
			effect: {
				type: "transform",
				transform
			}
		});
	}
	default(def) {
		const defaultValueFunc = typeof def === "function" ? def : () => def;
		return new ZodDefault({
			...processCreateParams(this._def),
			innerType: this,
			defaultValue: defaultValueFunc,
			typeName: ZodFirstPartyTypeKind.ZodDefault
		});
	}
	brand() {
		return new ZodBranded({
			typeName: ZodFirstPartyTypeKind.ZodBranded,
			type: this,
			...processCreateParams(this._def)
		});
	}
	catch(def) {
		const catchValueFunc = typeof def === "function" ? def : () => def;
		return new ZodCatch({
			...processCreateParams(this._def),
			innerType: this,
			catchValue: catchValueFunc,
			typeName: ZodFirstPartyTypeKind.ZodCatch
		});
	}
	describe(description) {
		const This = this.constructor;
		return new This({
			...this._def,
			description
		});
	}
	pipe(target) {
		return ZodPipeline.create(this, target);
	}
	readonly() {
		return ZodReadonly.create(this);
	}
	isOptional() {
		return this.safeParse(void 0).success;
	}
	isNullable() {
		return this.safeParse(null).success;
	}
};
var cuidRegex = /^c[^\s-]{8,}$/i;
var cuid2Regex = /^[0-9a-z]+$/;
var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
var nanoidRegex = /^[a-z0-9_-]{21}$/i;
var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
var emojiRegex;
var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
var dateRegex = new RegExp(`^${dateRegexSource}$`);
function timeRegexSource(args) {
	let secondsRegexSource = `[0-5]\\d`;
	if (args.precision) secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
	else if (args.precision == null) secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
	const secondsQuantifier = args.precision ? "+" : "?";
	return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
}
function timeRegex(args) {
	return new RegExp(`^${timeRegexSource(args)}$`);
}
function datetimeRegex(args) {
	let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
	const opts = [];
	opts.push(args.local ? `Z?` : `Z`);
	if (args.offset) opts.push(`([+-]\\d{2}:?\\d{2})`);
	regex = `${regex}(${opts.join("|")})`;
	return new RegExp(`^${regex}$`);
}
function isValidIP(ip, version) {
	if ((version === "v4" || !version) && ipv4Regex.test(ip)) return true;
	if ((version === "v6" || !version) && ipv6Regex.test(ip)) return true;
	return false;
}
function isValidJWT(jwt, alg) {
	if (!jwtRegex.test(jwt)) return false;
	try {
		const [header] = jwt.split(".");
		if (!header) return false;
		const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
		const decoded = JSON.parse(atob(base64));
		if (typeof decoded !== "object" || decoded === null) return false;
		if ("typ" in decoded && decoded?.typ !== "JWT") return false;
		if (!decoded.alg) return false;
		if (alg && decoded.alg !== alg) return false;
		return true;
	} catch {
		return false;
	}
}
function isValidCidr(ip, version) {
	if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) return true;
	if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) return true;
	return false;
}
var ZodString = class ZodString extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = String(input.data);
		if (this._getType(input) !== ZodParsedType.string) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.string,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const status = new ParseStatus();
		let ctx = void 0;
		for (const check of this._def.checks) if (check.kind === "min") {
			if (input.data.length < check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "string",
					inclusive: true,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (input.data.length > check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "string",
					inclusive: true,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "length") {
			const tooBig = input.data.length > check.value;
			const tooSmall = input.data.length < check.value;
			if (tooBig || tooSmall) {
				ctx = this._getOrReturnCtx(input, ctx);
				if (tooBig) addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "string",
					inclusive: true,
					exact: true,
					message: check.message
				});
				else if (tooSmall) addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "string",
					inclusive: true,
					exact: true,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "email") {
			if (!emailRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "email",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "emoji") {
			if (!emojiRegex) emojiRegex = new RegExp(_emojiRegex, "u");
			if (!emojiRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "emoji",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "uuid") {
			if (!uuidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "uuid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "nanoid") {
			if (!nanoidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "nanoid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cuid") {
			if (!cuidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cuid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cuid2") {
			if (!cuid2Regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cuid2",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "ulid") {
			if (!ulidRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "ulid",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "url") try {
			new URL(input.data);
		} catch {
			ctx = this._getOrReturnCtx(input, ctx);
			addIssueToContext(ctx, {
				validation: "url",
				code: ZodIssueCode.invalid_string,
				message: check.message
			});
			status.dirty();
		}
		else if (check.kind === "regex") {
			check.regex.lastIndex = 0;
			if (!check.regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "regex",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "trim") input.data = input.data.trim();
		else if (check.kind === "includes") {
			if (!input.data.includes(check.value, check.position)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: {
						includes: check.value,
						position: check.position
					},
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "toLowerCase") input.data = input.data.toLowerCase();
		else if (check.kind === "toUpperCase") input.data = input.data.toUpperCase();
		else if (check.kind === "startsWith") {
			if (!input.data.startsWith(check.value)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: { startsWith: check.value },
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "endsWith") {
			if (!input.data.endsWith(check.value)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: { endsWith: check.value },
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "datetime") {
			if (!datetimeRegex(check).test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "datetime",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "date") {
			if (!dateRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "date",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "time") {
			if (!timeRegex(check).test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_string,
					validation: "time",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "duration") {
			if (!durationRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "duration",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "ip") {
			if (!isValidIP(input.data, check.version)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "ip",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "jwt") {
			if (!isValidJWT(input.data, check.alg)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "jwt",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "cidr") {
			if (!isValidCidr(input.data, check.version)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "cidr",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "base64") {
			if (!base64Regex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "base64",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "base64url") {
			if (!base64urlRegex.test(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					validation: "base64url",
					code: ZodIssueCode.invalid_string,
					message: check.message
				});
				status.dirty();
			}
		} else util.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	_regex(regex, validation, message) {
		return this.refinement((data) => regex.test(data), {
			validation,
			code: ZodIssueCode.invalid_string,
			...errorUtil.errToObj(message)
		});
	}
	_addCheck(check) {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	email(message) {
		return this._addCheck({
			kind: "email",
			...errorUtil.errToObj(message)
		});
	}
	url(message) {
		return this._addCheck({
			kind: "url",
			...errorUtil.errToObj(message)
		});
	}
	emoji(message) {
		return this._addCheck({
			kind: "emoji",
			...errorUtil.errToObj(message)
		});
	}
	uuid(message) {
		return this._addCheck({
			kind: "uuid",
			...errorUtil.errToObj(message)
		});
	}
	nanoid(message) {
		return this._addCheck({
			kind: "nanoid",
			...errorUtil.errToObj(message)
		});
	}
	cuid(message) {
		return this._addCheck({
			kind: "cuid",
			...errorUtil.errToObj(message)
		});
	}
	cuid2(message) {
		return this._addCheck({
			kind: "cuid2",
			...errorUtil.errToObj(message)
		});
	}
	ulid(message) {
		return this._addCheck({
			kind: "ulid",
			...errorUtil.errToObj(message)
		});
	}
	base64(message) {
		return this._addCheck({
			kind: "base64",
			...errorUtil.errToObj(message)
		});
	}
	base64url(message) {
		return this._addCheck({
			kind: "base64url",
			...errorUtil.errToObj(message)
		});
	}
	jwt(options) {
		return this._addCheck({
			kind: "jwt",
			...errorUtil.errToObj(options)
		});
	}
	ip(options) {
		return this._addCheck({
			kind: "ip",
			...errorUtil.errToObj(options)
		});
	}
	cidr(options) {
		return this._addCheck({
			kind: "cidr",
			...errorUtil.errToObj(options)
		});
	}
	datetime(options) {
		if (typeof options === "string") return this._addCheck({
			kind: "datetime",
			precision: null,
			offset: false,
			local: false,
			message: options
		});
		return this._addCheck({
			kind: "datetime",
			precision: typeof options?.precision === "undefined" ? null : options?.precision,
			offset: options?.offset ?? false,
			local: options?.local ?? false,
			...errorUtil.errToObj(options?.message)
		});
	}
	date(message) {
		return this._addCheck({
			kind: "date",
			message
		});
	}
	time(options) {
		if (typeof options === "string") return this._addCheck({
			kind: "time",
			precision: null,
			message: options
		});
		return this._addCheck({
			kind: "time",
			precision: typeof options?.precision === "undefined" ? null : options?.precision,
			...errorUtil.errToObj(options?.message)
		});
	}
	duration(message) {
		return this._addCheck({
			kind: "duration",
			...errorUtil.errToObj(message)
		});
	}
	regex(regex, message) {
		return this._addCheck({
			kind: "regex",
			regex,
			...errorUtil.errToObj(message)
		});
	}
	includes(value, options) {
		return this._addCheck({
			kind: "includes",
			value,
			position: options?.position,
			...errorUtil.errToObj(options?.message)
		});
	}
	startsWith(value, message) {
		return this._addCheck({
			kind: "startsWith",
			value,
			...errorUtil.errToObj(message)
		});
	}
	endsWith(value, message) {
		return this._addCheck({
			kind: "endsWith",
			value,
			...errorUtil.errToObj(message)
		});
	}
	min(minLength, message) {
		return this._addCheck({
			kind: "min",
			value: minLength,
			...errorUtil.errToObj(message)
		});
	}
	max(maxLength, message) {
		return this._addCheck({
			kind: "max",
			value: maxLength,
			...errorUtil.errToObj(message)
		});
	}
	length(len, message) {
		return this._addCheck({
			kind: "length",
			value: len,
			...errorUtil.errToObj(message)
		});
	}
	/**
	* Equivalent to `.min(1)`
	*/
	nonempty(message) {
		return this.min(1, errorUtil.errToObj(message));
	}
	trim() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "trim" }]
		});
	}
	toLowerCase() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "toLowerCase" }]
		});
	}
	toUpperCase() {
		return new ZodString({
			...this._def,
			checks: [...this._def.checks, { kind: "toUpperCase" }]
		});
	}
	get isDatetime() {
		return !!this._def.checks.find((ch) => ch.kind === "datetime");
	}
	get isDate() {
		return !!this._def.checks.find((ch) => ch.kind === "date");
	}
	get isTime() {
		return !!this._def.checks.find((ch) => ch.kind === "time");
	}
	get isDuration() {
		return !!this._def.checks.find((ch) => ch.kind === "duration");
	}
	get isEmail() {
		return !!this._def.checks.find((ch) => ch.kind === "email");
	}
	get isURL() {
		return !!this._def.checks.find((ch) => ch.kind === "url");
	}
	get isEmoji() {
		return !!this._def.checks.find((ch) => ch.kind === "emoji");
	}
	get isUUID() {
		return !!this._def.checks.find((ch) => ch.kind === "uuid");
	}
	get isNANOID() {
		return !!this._def.checks.find((ch) => ch.kind === "nanoid");
	}
	get isCUID() {
		return !!this._def.checks.find((ch) => ch.kind === "cuid");
	}
	get isCUID2() {
		return !!this._def.checks.find((ch) => ch.kind === "cuid2");
	}
	get isULID() {
		return !!this._def.checks.find((ch) => ch.kind === "ulid");
	}
	get isIP() {
		return !!this._def.checks.find((ch) => ch.kind === "ip");
	}
	get isCIDR() {
		return !!this._def.checks.find((ch) => ch.kind === "cidr");
	}
	get isBase64() {
		return !!this._def.checks.find((ch) => ch.kind === "base64");
	}
	get isBase64url() {
		return !!this._def.checks.find((ch) => ch.kind === "base64url");
	}
	get minLength() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxLength() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
};
ZodString.create = (params) => {
	return new ZodString({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodString,
		coerce: params?.coerce ?? false,
		...processCreateParams(params)
	});
};
function floatSafeRemainder(val, step) {
	const valDecCount = (val.toString().split(".")[1] || "").length;
	const stepDecCount = (step.toString().split(".")[1] || "").length;
	const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
	return Number.parseInt(val.toFixed(decCount).replace(".", "")) % Number.parseInt(step.toFixed(decCount).replace(".", "")) / 10 ** decCount;
}
var ZodNumber = class ZodNumber extends ZodType {
	constructor() {
		super(...arguments);
		this.min = this.gte;
		this.max = this.lte;
		this.step = this.multipleOf;
	}
	_parse(input) {
		if (this._def.coerce) input.data = Number(input.data);
		if (this._getType(input) !== ZodParsedType.number) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.number,
				received: ctx.parsedType
			});
			return INVALID;
		}
		let ctx = void 0;
		const status = new ParseStatus();
		for (const check of this._def.checks) if (check.kind === "int") {
			if (!util.isInteger(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.invalid_type,
					expected: "integer",
					received: "float",
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "min") {
			if (check.inclusive ? input.data < check.value : input.data <= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: check.value,
					type: "number",
					inclusive: check.inclusive,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (check.inclusive ? input.data > check.value : input.data >= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: check.value,
					type: "number",
					inclusive: check.inclusive,
					exact: false,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "multipleOf") {
			if (floatSafeRemainder(input.data, check.value) !== 0) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_multiple_of,
					multipleOf: check.value,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "finite") {
			if (!Number.isFinite(input.data)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_finite,
					message: check.message
				});
				status.dirty();
			}
		} else util.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	gte(value, message) {
		return this.setLimit("min", value, true, errorUtil.toString(message));
	}
	gt(value, message) {
		return this.setLimit("min", value, false, errorUtil.toString(message));
	}
	lte(value, message) {
		return this.setLimit("max", value, true, errorUtil.toString(message));
	}
	lt(value, message) {
		return this.setLimit("max", value, false, errorUtil.toString(message));
	}
	setLimit(kind, value, inclusive, message) {
		return new ZodNumber({
			...this._def,
			checks: [...this._def.checks, {
				kind,
				value,
				inclusive,
				message: errorUtil.toString(message)
			}]
		});
	}
	_addCheck(check) {
		return new ZodNumber({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	int(message) {
		return this._addCheck({
			kind: "int",
			message: errorUtil.toString(message)
		});
	}
	positive(message) {
		return this._addCheck({
			kind: "min",
			value: 0,
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	negative(message) {
		return this._addCheck({
			kind: "max",
			value: 0,
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	nonpositive(message) {
		return this._addCheck({
			kind: "max",
			value: 0,
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	nonnegative(message) {
		return this._addCheck({
			kind: "min",
			value: 0,
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	multipleOf(value, message) {
		return this._addCheck({
			kind: "multipleOf",
			value,
			message: errorUtil.toString(message)
		});
	}
	finite(message) {
		return this._addCheck({
			kind: "finite",
			message: errorUtil.toString(message)
		});
	}
	safe(message) {
		return this._addCheck({
			kind: "min",
			inclusive: true,
			value: Number.MIN_SAFE_INTEGER,
			message: errorUtil.toString(message)
		})._addCheck({
			kind: "max",
			inclusive: true,
			value: Number.MAX_SAFE_INTEGER,
			message: errorUtil.toString(message)
		});
	}
	get minValue() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxValue() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
	get isInt() {
		return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
	}
	get isFinite() {
		let max = null;
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") return true;
		else if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		} else if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return Number.isFinite(min) && Number.isFinite(max);
	}
};
ZodNumber.create = (params) => {
	return new ZodNumber({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodNumber,
		coerce: params?.coerce || false,
		...processCreateParams(params)
	});
};
var ZodBigInt = class ZodBigInt extends ZodType {
	constructor() {
		super(...arguments);
		this.min = this.gte;
		this.max = this.lte;
	}
	_parse(input) {
		if (this._def.coerce) try {
			input.data = BigInt(input.data);
		} catch {
			return this._getInvalidInput(input);
		}
		if (this._getType(input) !== ZodParsedType.bigint) return this._getInvalidInput(input);
		let ctx = void 0;
		const status = new ParseStatus();
		for (const check of this._def.checks) if (check.kind === "min") {
			if (check.inclusive ? input.data < check.value : input.data <= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					type: "bigint",
					minimum: check.value,
					inclusive: check.inclusive,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (check.inclusive ? input.data > check.value : input.data >= check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					type: "bigint",
					maximum: check.value,
					inclusive: check.inclusive,
					message: check.message
				});
				status.dirty();
			}
		} else if (check.kind === "multipleOf") {
			if (input.data % check.value !== BigInt(0)) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.not_multiple_of,
					multipleOf: check.value,
					message: check.message
				});
				status.dirty();
			}
		} else util.assertNever(check);
		return {
			status: status.value,
			value: input.data
		};
	}
	_getInvalidInput(input) {
		const ctx = this._getOrReturnCtx(input);
		addIssueToContext(ctx, {
			code: ZodIssueCode.invalid_type,
			expected: ZodParsedType.bigint,
			received: ctx.parsedType
		});
		return INVALID;
	}
	gte(value, message) {
		return this.setLimit("min", value, true, errorUtil.toString(message));
	}
	gt(value, message) {
		return this.setLimit("min", value, false, errorUtil.toString(message));
	}
	lte(value, message) {
		return this.setLimit("max", value, true, errorUtil.toString(message));
	}
	lt(value, message) {
		return this.setLimit("max", value, false, errorUtil.toString(message));
	}
	setLimit(kind, value, inclusive, message) {
		return new ZodBigInt({
			...this._def,
			checks: [...this._def.checks, {
				kind,
				value,
				inclusive,
				message: errorUtil.toString(message)
			}]
		});
	}
	_addCheck(check) {
		return new ZodBigInt({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	positive(message) {
		return this._addCheck({
			kind: "min",
			value: BigInt(0),
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	negative(message) {
		return this._addCheck({
			kind: "max",
			value: BigInt(0),
			inclusive: false,
			message: errorUtil.toString(message)
		});
	}
	nonpositive(message) {
		return this._addCheck({
			kind: "max",
			value: BigInt(0),
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	nonnegative(message) {
		return this._addCheck({
			kind: "min",
			value: BigInt(0),
			inclusive: true,
			message: errorUtil.toString(message)
		});
	}
	multipleOf(value, message) {
		return this._addCheck({
			kind: "multipleOf",
			value,
			message: errorUtil.toString(message)
		});
	}
	get minValue() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min;
	}
	get maxValue() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max;
	}
};
ZodBigInt.create = (params) => {
	return new ZodBigInt({
		checks: [],
		typeName: ZodFirstPartyTypeKind.ZodBigInt,
		coerce: params?.coerce ?? false,
		...processCreateParams(params)
	});
};
var ZodBoolean = class extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = Boolean(input.data);
		if (this._getType(input) !== ZodParsedType.boolean) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.boolean,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodBoolean.create = (params) => {
	return new ZodBoolean({
		typeName: ZodFirstPartyTypeKind.ZodBoolean,
		coerce: params?.coerce || false,
		...processCreateParams(params)
	});
};
var ZodDate = class ZodDate extends ZodType {
	_parse(input) {
		if (this._def.coerce) input.data = new Date(input.data);
		if (this._getType(input) !== ZodParsedType.date) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.date,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (Number.isNaN(input.data.getTime())) {
			addIssueToContext(this._getOrReturnCtx(input), { code: ZodIssueCode.invalid_date });
			return INVALID;
		}
		const status = new ParseStatus();
		let ctx = void 0;
		for (const check of this._def.checks) if (check.kind === "min") {
			if (input.data.getTime() < check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					message: check.message,
					inclusive: true,
					exact: false,
					minimum: check.value,
					type: "date"
				});
				status.dirty();
			}
		} else if (check.kind === "max") {
			if (input.data.getTime() > check.value) {
				ctx = this._getOrReturnCtx(input, ctx);
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					message: check.message,
					inclusive: true,
					exact: false,
					maximum: check.value,
					type: "date"
				});
				status.dirty();
			}
		} else util.assertNever(check);
		return {
			status: status.value,
			value: new Date(input.data.getTime())
		};
	}
	_addCheck(check) {
		return new ZodDate({
			...this._def,
			checks: [...this._def.checks, check]
		});
	}
	min(minDate, message) {
		return this._addCheck({
			kind: "min",
			value: minDate.getTime(),
			message: errorUtil.toString(message)
		});
	}
	max(maxDate, message) {
		return this._addCheck({
			kind: "max",
			value: maxDate.getTime(),
			message: errorUtil.toString(message)
		});
	}
	get minDate() {
		let min = null;
		for (const ch of this._def.checks) if (ch.kind === "min") {
			if (min === null || ch.value > min) min = ch.value;
		}
		return min != null ? new Date(min) : null;
	}
	get maxDate() {
		let max = null;
		for (const ch of this._def.checks) if (ch.kind === "max") {
			if (max === null || ch.value < max) max = ch.value;
		}
		return max != null ? new Date(max) : null;
	}
};
ZodDate.create = (params) => {
	return new ZodDate({
		checks: [],
		coerce: params?.coerce || false,
		typeName: ZodFirstPartyTypeKind.ZodDate,
		...processCreateParams(params)
	});
};
var ZodSymbol = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.symbol) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.symbol,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodSymbol.create = (params) => {
	return new ZodSymbol({
		typeName: ZodFirstPartyTypeKind.ZodSymbol,
		...processCreateParams(params)
	});
};
var ZodUndefined = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.undefined) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.undefined,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodUndefined.create = (params) => {
	return new ZodUndefined({
		typeName: ZodFirstPartyTypeKind.ZodUndefined,
		...processCreateParams(params)
	});
};
var ZodNull = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.null) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.null,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodNull.create = (params) => {
	return new ZodNull({
		typeName: ZodFirstPartyTypeKind.ZodNull,
		...processCreateParams(params)
	});
};
var ZodAny = class extends ZodType {
	constructor() {
		super(...arguments);
		this._any = true;
	}
	_parse(input) {
		return OK(input.data);
	}
};
ZodAny.create = (params) => {
	return new ZodAny({
		typeName: ZodFirstPartyTypeKind.ZodAny,
		...processCreateParams(params)
	});
};
var ZodUnknown = class extends ZodType {
	constructor() {
		super(...arguments);
		this._unknown = true;
	}
	_parse(input) {
		return OK(input.data);
	}
};
ZodUnknown.create = (params) => {
	return new ZodUnknown({
		typeName: ZodFirstPartyTypeKind.ZodUnknown,
		...processCreateParams(params)
	});
};
var ZodNever = class extends ZodType {
	_parse(input) {
		const ctx = this._getOrReturnCtx(input);
		addIssueToContext(ctx, {
			code: ZodIssueCode.invalid_type,
			expected: ZodParsedType.never,
			received: ctx.parsedType
		});
		return INVALID;
	}
};
ZodNever.create = (params) => {
	return new ZodNever({
		typeName: ZodFirstPartyTypeKind.ZodNever,
		...processCreateParams(params)
	});
};
var ZodVoid = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.undefined) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.void,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK(input.data);
	}
};
ZodVoid.create = (params) => {
	return new ZodVoid({
		typeName: ZodFirstPartyTypeKind.ZodVoid,
		...processCreateParams(params)
	});
};
var ZodArray = class ZodArray extends ZodType {
	_parse(input) {
		const { ctx, status } = this._processInputParams(input);
		const def = this._def;
		if (ctx.parsedType !== ZodParsedType.array) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.array,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (def.exactLength !== null) {
			const tooBig = ctx.data.length > def.exactLength.value;
			const tooSmall = ctx.data.length < def.exactLength.value;
			if (tooBig || tooSmall) {
				addIssueToContext(ctx, {
					code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
					minimum: tooSmall ? def.exactLength.value : void 0,
					maximum: tooBig ? def.exactLength.value : void 0,
					type: "array",
					inclusive: true,
					exact: true,
					message: def.exactLength.message
				});
				status.dirty();
			}
		}
		if (def.minLength !== null) {
			if (ctx.data.length < def.minLength.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: def.minLength.value,
					type: "array",
					inclusive: true,
					exact: false,
					message: def.minLength.message
				});
				status.dirty();
			}
		}
		if (def.maxLength !== null) {
			if (ctx.data.length > def.maxLength.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: def.maxLength.value,
					type: "array",
					inclusive: true,
					exact: false,
					message: def.maxLength.message
				});
				status.dirty();
			}
		}
		if (ctx.common.async) return Promise.all([...ctx.data].map((item, i) => {
			return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
		})).then((result) => {
			return ParseStatus.mergeArray(status, result);
		});
		const result = [...ctx.data].map((item, i) => {
			return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
		});
		return ParseStatus.mergeArray(status, result);
	}
	get element() {
		return this._def.type;
	}
	min(minLength, message) {
		return new ZodArray({
			...this._def,
			minLength: {
				value: minLength,
				message: errorUtil.toString(message)
			}
		});
	}
	max(maxLength, message) {
		return new ZodArray({
			...this._def,
			maxLength: {
				value: maxLength,
				message: errorUtil.toString(message)
			}
		});
	}
	length(len, message) {
		return new ZodArray({
			...this._def,
			exactLength: {
				value: len,
				message: errorUtil.toString(message)
			}
		});
	}
	nonempty(message) {
		return this.min(1, message);
	}
};
ZodArray.create = (schema, params) => {
	return new ZodArray({
		type: schema,
		minLength: null,
		maxLength: null,
		exactLength: null,
		typeName: ZodFirstPartyTypeKind.ZodArray,
		...processCreateParams(params)
	});
};
function deepPartialify(schema) {
	if (schema instanceof ZodObject) {
		const newShape = {};
		for (const key in schema.shape) {
			const fieldSchema = schema.shape[key];
			newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
		}
		return new ZodObject({
			...schema._def,
			shape: () => newShape
		});
	} else if (schema instanceof ZodArray) return new ZodArray({
		...schema._def,
		type: deepPartialify(schema.element)
	});
	else if (schema instanceof ZodOptional) return ZodOptional.create(deepPartialify(schema.unwrap()));
	else if (schema instanceof ZodNullable) return ZodNullable.create(deepPartialify(schema.unwrap()));
	else if (schema instanceof ZodTuple) return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
	else return schema;
}
var ZodObject = class ZodObject extends ZodType {
	constructor() {
		super(...arguments);
		this._cached = null;
		/**
		* @deprecated In most cases, this is no longer needed - unknown properties are now silently stripped.
		* If you want to pass through unknown properties, use `.passthrough()` instead.
		*/
		this.nonstrict = this.passthrough;
		/**
		* @deprecated Use `.extend` instead
		*  */
		this.augment = this.extend;
	}
	_getCached() {
		if (this._cached !== null) return this._cached;
		const shape = this._def.shape();
		const keys = util.objectKeys(shape);
		this._cached = {
			shape,
			keys
		};
		return this._cached;
	}
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.object) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const { status, ctx } = this._processInputParams(input);
		const { shape, keys: shapeKeys } = this._getCached();
		const extraKeys = [];
		if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
			for (const key in ctx.data) if (!shapeKeys.includes(key)) extraKeys.push(key);
		}
		const pairs = [];
		for (const key of shapeKeys) {
			const keyValidator = shape[key];
			const value = ctx.data[key];
			pairs.push({
				key: {
					status: "valid",
					value: key
				},
				value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
				alwaysSet: key in ctx.data
			});
		}
		if (this._def.catchall instanceof ZodNever) {
			const unknownKeys = this._def.unknownKeys;
			if (unknownKeys === "passthrough") for (const key of extraKeys) pairs.push({
				key: {
					status: "valid",
					value: key
				},
				value: {
					status: "valid",
					value: ctx.data[key]
				}
			});
			else if (unknownKeys === "strict") {
				if (extraKeys.length > 0) {
					addIssueToContext(ctx, {
						code: ZodIssueCode.unrecognized_keys,
						keys: extraKeys
					});
					status.dirty();
				}
			} else if (unknownKeys === "strip") {} else throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
		} else {
			const catchall = this._def.catchall;
			for (const key of extraKeys) {
				const value = ctx.data[key];
				pairs.push({
					key: {
						status: "valid",
						value: key
					},
					value: catchall._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
					alwaysSet: key in ctx.data
				});
			}
		}
		if (ctx.common.async) return Promise.resolve().then(async () => {
			const syncPairs = [];
			for (const pair of pairs) {
				const key = await pair.key;
				const value = await pair.value;
				syncPairs.push({
					key,
					value,
					alwaysSet: pair.alwaysSet
				});
			}
			return syncPairs;
		}).then((syncPairs) => {
			return ParseStatus.mergeObjectSync(status, syncPairs);
		});
		else return ParseStatus.mergeObjectSync(status, pairs);
	}
	get shape() {
		return this._def.shape();
	}
	strict(message) {
		errorUtil.errToObj;
		return new ZodObject({
			...this._def,
			unknownKeys: "strict",
			...message !== void 0 ? { errorMap: (issue, ctx) => {
				const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
				if (issue.code === "unrecognized_keys") return { message: errorUtil.errToObj(message).message ?? defaultError };
				return { message: defaultError };
			} } : {}
		});
	}
	strip() {
		return new ZodObject({
			...this._def,
			unknownKeys: "strip"
		});
	}
	passthrough() {
		return new ZodObject({
			...this._def,
			unknownKeys: "passthrough"
		});
	}
	extend(augmentation) {
		return new ZodObject({
			...this._def,
			shape: () => ({
				...this._def.shape(),
				...augmentation
			})
		});
	}
	/**
	* Prior to zod@1.0.12 there was a bug in the
	* inferred type of merged objects. Please
	* upgrade if you are experiencing issues.
	*/
	merge(merging) {
		return new ZodObject({
			unknownKeys: merging._def.unknownKeys,
			catchall: merging._def.catchall,
			shape: () => ({
				...this._def.shape(),
				...merging._def.shape()
			}),
			typeName: ZodFirstPartyTypeKind.ZodObject
		});
	}
	setKey(key, schema) {
		return this.augment({ [key]: schema });
	}
	catchall(index) {
		return new ZodObject({
			...this._def,
			catchall: index
		});
	}
	pick(mask) {
		const shape = {};
		for (const key of util.objectKeys(mask)) if (mask[key] && this.shape[key]) shape[key] = this.shape[key];
		return new ZodObject({
			...this._def,
			shape: () => shape
		});
	}
	omit(mask) {
		const shape = {};
		for (const key of util.objectKeys(this.shape)) if (!mask[key]) shape[key] = this.shape[key];
		return new ZodObject({
			...this._def,
			shape: () => shape
		});
	}
	/**
	* @deprecated
	*/
	deepPartial() {
		return deepPartialify(this);
	}
	partial(mask) {
		const newShape = {};
		for (const key of util.objectKeys(this.shape)) {
			const fieldSchema = this.shape[key];
			if (mask && !mask[key]) newShape[key] = fieldSchema;
			else newShape[key] = fieldSchema.optional();
		}
		return new ZodObject({
			...this._def,
			shape: () => newShape
		});
	}
	required(mask) {
		const newShape = {};
		for (const key of util.objectKeys(this.shape)) if (mask && !mask[key]) newShape[key] = this.shape[key];
		else {
			let newField = this.shape[key];
			while (newField instanceof ZodOptional) newField = newField._def.innerType;
			newShape[key] = newField;
		}
		return new ZodObject({
			...this._def,
			shape: () => newShape
		});
	}
	keyof() {
		return createZodEnum(util.objectKeys(this.shape));
	}
};
ZodObject.create = (shape, params) => {
	return new ZodObject({
		shape: () => shape,
		unknownKeys: "strip",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
ZodObject.strictCreate = (shape, params) => {
	return new ZodObject({
		shape: () => shape,
		unknownKeys: "strict",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
ZodObject.lazycreate = (shape, params) => {
	return new ZodObject({
		shape,
		unknownKeys: "strip",
		catchall: ZodNever.create(),
		typeName: ZodFirstPartyTypeKind.ZodObject,
		...processCreateParams(params)
	});
};
var ZodUnion = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const options = this._def.options;
		function handleResults(results) {
			for (const result of results) if (result.result.status === "valid") return result.result;
			for (const result of results) if (result.result.status === "dirty") {
				ctx.common.issues.push(...result.ctx.common.issues);
				return result.result;
			}
			const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union,
				unionErrors
			});
			return INVALID;
		}
		if (ctx.common.async) return Promise.all(options.map(async (option) => {
			const childCtx = {
				...ctx,
				common: {
					...ctx.common,
					issues: []
				},
				parent: null
			};
			return {
				result: await option._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: childCtx
				}),
				ctx: childCtx
			};
		})).then(handleResults);
		else {
			let dirty = void 0;
			const issues = [];
			for (const option of options) {
				const childCtx = {
					...ctx,
					common: {
						...ctx.common,
						issues: []
					},
					parent: null
				};
				const result = option._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: childCtx
				});
				if (result.status === "valid") return result;
				else if (result.status === "dirty" && !dirty) dirty = {
					result,
					ctx: childCtx
				};
				if (childCtx.common.issues.length) issues.push(childCtx.common.issues);
			}
			if (dirty) {
				ctx.common.issues.push(...dirty.ctx.common.issues);
				return dirty.result;
			}
			const unionErrors = issues.map((issues) => new ZodError(issues));
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union,
				unionErrors
			});
			return INVALID;
		}
	}
	get options() {
		return this._def.options;
	}
};
ZodUnion.create = (types, params) => {
	return new ZodUnion({
		options: types,
		typeName: ZodFirstPartyTypeKind.ZodUnion,
		...processCreateParams(params)
	});
};
var getDiscriminator = (type) => {
	if (type instanceof ZodLazy) return getDiscriminator(type.schema);
	else if (type instanceof ZodEffects) return getDiscriminator(type.innerType());
	else if (type instanceof ZodLiteral) return [type.value];
	else if (type instanceof ZodEnum) return type.options;
	else if (type instanceof ZodNativeEnum) return util.objectValues(type.enum);
	else if (type instanceof ZodDefault) return getDiscriminator(type._def.innerType);
	else if (type instanceof ZodUndefined) return [void 0];
	else if (type instanceof ZodNull) return [null];
	else if (type instanceof ZodOptional) return [void 0, ...getDiscriminator(type.unwrap())];
	else if (type instanceof ZodNullable) return [null, ...getDiscriminator(type.unwrap())];
	else if (type instanceof ZodBranded) return getDiscriminator(type.unwrap());
	else if (type instanceof ZodReadonly) return getDiscriminator(type.unwrap());
	else if (type instanceof ZodCatch) return getDiscriminator(type._def.innerType);
	else return [];
};
var ZodDiscriminatedUnion = class ZodDiscriminatedUnion extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.object) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const discriminator = this.discriminator;
		const discriminatorValue = ctx.data[discriminator];
		const option = this.optionsMap.get(discriminatorValue);
		if (!option) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_union_discriminator,
				options: Array.from(this.optionsMap.keys()),
				path: [discriminator]
			});
			return INVALID;
		}
		if (ctx.common.async) return option._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
		else return option._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
	}
	get discriminator() {
		return this._def.discriminator;
	}
	get options() {
		return this._def.options;
	}
	get optionsMap() {
		return this._def.optionsMap;
	}
	/**
	* The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
	* However, it only allows a union of objects, all of which need to share a discriminator property. This property must
	* have a different value for each object in the union.
	* @param discriminator the name of the discriminator property
	* @param types an array of object schemas
	* @param params
	*/
	static create(discriminator, options, params) {
		const optionsMap = /* @__PURE__ */ new Map();
		for (const type of options) {
			const discriminatorValues = getDiscriminator(type.shape[discriminator]);
			if (!discriminatorValues.length) throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
			for (const value of discriminatorValues) {
				if (optionsMap.has(value)) throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
				optionsMap.set(value, type);
			}
		}
		return new ZodDiscriminatedUnion({
			typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
			discriminator,
			options,
			optionsMap,
			...processCreateParams(params)
		});
	}
};
function mergeValues(a, b) {
	const aType = getParsedType(a);
	const bType = getParsedType(b);
	if (a === b) return {
		valid: true,
		data: a
	};
	else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
		const bKeys = util.objectKeys(b);
		const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
		const newObj = {
			...a,
			...b
		};
		for (const key of sharedKeys) {
			const sharedValue = mergeValues(a[key], b[key]);
			if (!sharedValue.valid) return { valid: false };
			newObj[key] = sharedValue.data;
		}
		return {
			valid: true,
			data: newObj
		};
	} else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
		if (a.length !== b.length) return { valid: false };
		const newArray = [];
		for (let index = 0; index < a.length; index++) {
			const itemA = a[index];
			const itemB = b[index];
			const sharedValue = mergeValues(itemA, itemB);
			if (!sharedValue.valid) return { valid: false };
			newArray.push(sharedValue.data);
		}
		return {
			valid: true,
			data: newArray
		};
	} else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) return {
		valid: true,
		data: a
	};
	else return { valid: false };
}
var ZodIntersection = class extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		const handleParsed = (parsedLeft, parsedRight) => {
			if (isAborted(parsedLeft) || isAborted(parsedRight)) return INVALID;
			const merged = mergeValues(parsedLeft.value, parsedRight.value);
			if (!merged.valid) {
				addIssueToContext(ctx, { code: ZodIssueCode.invalid_intersection_types });
				return INVALID;
			}
			if (isDirty(parsedLeft) || isDirty(parsedRight)) status.dirty();
			return {
				status: status.value,
				value: merged.data
			};
		};
		if (ctx.common.async) return Promise.all([this._def.left._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}), this._def.right._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		})]).then(([left, right]) => handleParsed(left, right));
		else return handleParsed(this._def.left._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}), this._def.right._parseSync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}));
	}
};
ZodIntersection.create = (left, right, params) => {
	return new ZodIntersection({
		left,
		right,
		typeName: ZodFirstPartyTypeKind.ZodIntersection,
		...processCreateParams(params)
	});
};
var ZodTuple = class ZodTuple extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.array) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.array,
				received: ctx.parsedType
			});
			return INVALID;
		}
		if (ctx.data.length < this._def.items.length) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.too_small,
				minimum: this._def.items.length,
				inclusive: true,
				exact: false,
				type: "array"
			});
			return INVALID;
		}
		if (!this._def.rest && ctx.data.length > this._def.items.length) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.too_big,
				maximum: this._def.items.length,
				inclusive: true,
				exact: false,
				type: "array"
			});
			status.dirty();
		}
		const items = [...ctx.data].map((item, itemIndex) => {
			const schema = this._def.items[itemIndex] || this._def.rest;
			if (!schema) return null;
			return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
		}).filter((x) => !!x);
		if (ctx.common.async) return Promise.all(items).then((results) => {
			return ParseStatus.mergeArray(status, results);
		});
		else return ParseStatus.mergeArray(status, items);
	}
	get items() {
		return this._def.items;
	}
	rest(rest) {
		return new ZodTuple({
			...this._def,
			rest
		});
	}
};
ZodTuple.create = (schemas, params) => {
	if (!Array.isArray(schemas)) throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
	return new ZodTuple({
		items: schemas,
		typeName: ZodFirstPartyTypeKind.ZodTuple,
		rest: null,
		...processCreateParams(params)
	});
};
var ZodRecord = class ZodRecord extends ZodType {
	get keySchema() {
		return this._def.keyType;
	}
	get valueSchema() {
		return this._def.valueType;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.object) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.object,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const pairs = [];
		const keyType = this._def.keyType;
		const valueType = this._def.valueType;
		for (const key in ctx.data) pairs.push({
			key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
			value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
			alwaysSet: key in ctx.data
		});
		if (ctx.common.async) return ParseStatus.mergeObjectAsync(status, pairs);
		else return ParseStatus.mergeObjectSync(status, pairs);
	}
	get element() {
		return this._def.valueType;
	}
	static create(first, second, third) {
		if (second instanceof ZodType) return new ZodRecord({
			keyType: first,
			valueType: second,
			typeName: ZodFirstPartyTypeKind.ZodRecord,
			...processCreateParams(third)
		});
		return new ZodRecord({
			keyType: ZodString.create(),
			valueType: first,
			typeName: ZodFirstPartyTypeKind.ZodRecord,
			...processCreateParams(second)
		});
	}
};
var ZodMap = class extends ZodType {
	get keySchema() {
		return this._def.keyType;
	}
	get valueSchema() {
		return this._def.valueType;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.map) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.map,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const keyType = this._def.keyType;
		const valueType = this._def.valueType;
		const pairs = [...ctx.data.entries()].map(([key, value], index) => {
			return {
				key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
				value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
			};
		});
		if (ctx.common.async) {
			const finalMap = /* @__PURE__ */ new Map();
			return Promise.resolve().then(async () => {
				for (const pair of pairs) {
					const key = await pair.key;
					const value = await pair.value;
					if (key.status === "aborted" || value.status === "aborted") return INVALID;
					if (key.status === "dirty" || value.status === "dirty") status.dirty();
					finalMap.set(key.value, value.value);
				}
				return {
					status: status.value,
					value: finalMap
				};
			});
		} else {
			const finalMap = /* @__PURE__ */ new Map();
			for (const pair of pairs) {
				const key = pair.key;
				const value = pair.value;
				if (key.status === "aborted" || value.status === "aborted") return INVALID;
				if (key.status === "dirty" || value.status === "dirty") status.dirty();
				finalMap.set(key.value, value.value);
			}
			return {
				status: status.value,
				value: finalMap
			};
		}
	}
};
ZodMap.create = (keyType, valueType, params) => {
	return new ZodMap({
		valueType,
		keyType,
		typeName: ZodFirstPartyTypeKind.ZodMap,
		...processCreateParams(params)
	});
};
var ZodSet = class ZodSet extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.set) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.set,
				received: ctx.parsedType
			});
			return INVALID;
		}
		const def = this._def;
		if (def.minSize !== null) {
			if (ctx.data.size < def.minSize.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_small,
					minimum: def.minSize.value,
					type: "set",
					inclusive: true,
					exact: false,
					message: def.minSize.message
				});
				status.dirty();
			}
		}
		if (def.maxSize !== null) {
			if (ctx.data.size > def.maxSize.value) {
				addIssueToContext(ctx, {
					code: ZodIssueCode.too_big,
					maximum: def.maxSize.value,
					type: "set",
					inclusive: true,
					exact: false,
					message: def.maxSize.message
				});
				status.dirty();
			}
		}
		const valueType = this._def.valueType;
		function finalizeSet(elements) {
			const parsedSet = /* @__PURE__ */ new Set();
			for (const element of elements) {
				if (element.status === "aborted") return INVALID;
				if (element.status === "dirty") status.dirty();
				parsedSet.add(element.value);
			}
			return {
				status: status.value,
				value: parsedSet
			};
		}
		const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
		if (ctx.common.async) return Promise.all(elements).then((elements) => finalizeSet(elements));
		else return finalizeSet(elements);
	}
	min(minSize, message) {
		return new ZodSet({
			...this._def,
			minSize: {
				value: minSize,
				message: errorUtil.toString(message)
			}
		});
	}
	max(maxSize, message) {
		return new ZodSet({
			...this._def,
			maxSize: {
				value: maxSize,
				message: errorUtil.toString(message)
			}
		});
	}
	size(size, message) {
		return this.min(size, message).max(size, message);
	}
	nonempty(message) {
		return this.min(1, message);
	}
};
ZodSet.create = (valueType, params) => {
	return new ZodSet({
		valueType,
		minSize: null,
		maxSize: null,
		typeName: ZodFirstPartyTypeKind.ZodSet,
		...processCreateParams(params)
	});
};
var ZodFunction = class ZodFunction extends ZodType {
	constructor() {
		super(...arguments);
		this.validate = this.implement;
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.function) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.function,
				received: ctx.parsedType
			});
			return INVALID;
		}
		function makeArgsIssue(args, error) {
			return makeIssue({
				data: args,
				path: ctx.path,
				errorMaps: [
					ctx.common.contextualErrorMap,
					ctx.schemaErrorMap,
					getErrorMap(),
					errorMap
				].filter((x) => !!x),
				issueData: {
					code: ZodIssueCode.invalid_arguments,
					argumentsError: error
				}
			});
		}
		function makeReturnsIssue(returns, error) {
			return makeIssue({
				data: returns,
				path: ctx.path,
				errorMaps: [
					ctx.common.contextualErrorMap,
					ctx.schemaErrorMap,
					getErrorMap(),
					errorMap
				].filter((x) => !!x),
				issueData: {
					code: ZodIssueCode.invalid_return_type,
					returnTypeError: error
				}
			});
		}
		const params = { errorMap: ctx.common.contextualErrorMap };
		const fn = ctx.data;
		if (this._def.returns instanceof ZodPromise) {
			const me = this;
			return OK(async function(...args) {
				const error = new ZodError([]);
				const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
					error.addIssue(makeArgsIssue(args, e));
					throw error;
				});
				const result = await Reflect.apply(fn, this, parsedArgs);
				return await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
					error.addIssue(makeReturnsIssue(result, e));
					throw error;
				});
			});
		} else {
			const me = this;
			return OK(function(...args) {
				const parsedArgs = me._def.args.safeParse(args, params);
				if (!parsedArgs.success) throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
				const result = Reflect.apply(fn, this, parsedArgs.data);
				const parsedReturns = me._def.returns.safeParse(result, params);
				if (!parsedReturns.success) throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
				return parsedReturns.data;
			});
		}
	}
	parameters() {
		return this._def.args;
	}
	returnType() {
		return this._def.returns;
	}
	args(...items) {
		return new ZodFunction({
			...this._def,
			args: ZodTuple.create(items).rest(ZodUnknown.create())
		});
	}
	returns(returnType) {
		return new ZodFunction({
			...this._def,
			returns: returnType
		});
	}
	implement(func) {
		return this.parse(func);
	}
	strictImplement(func) {
		return this.parse(func);
	}
	static create(args, returns, params) {
		return new ZodFunction({
			args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
			returns: returns || ZodUnknown.create(),
			typeName: ZodFirstPartyTypeKind.ZodFunction,
			...processCreateParams(params)
		});
	}
};
var ZodLazy = class extends ZodType {
	get schema() {
		return this._def.getter();
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		return this._def.getter()._parse({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		});
	}
};
ZodLazy.create = (getter, params) => {
	return new ZodLazy({
		getter,
		typeName: ZodFirstPartyTypeKind.ZodLazy,
		...processCreateParams(params)
	});
};
var ZodLiteral = class extends ZodType {
	_parse(input) {
		if (input.data !== this._def.value) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_literal,
				expected: this._def.value
			});
			return INVALID;
		}
		return {
			status: "valid",
			value: input.data
		};
	}
	get value() {
		return this._def.value;
	}
};
ZodLiteral.create = (value, params) => {
	return new ZodLiteral({
		value,
		typeName: ZodFirstPartyTypeKind.ZodLiteral,
		...processCreateParams(params)
	});
};
function createZodEnum(values, params) {
	return new ZodEnum({
		values,
		typeName: ZodFirstPartyTypeKind.ZodEnum,
		...processCreateParams(params)
	});
}
var ZodEnum = class ZodEnum extends ZodType {
	_parse(input) {
		if (typeof input.data !== "string") {
			const ctx = this._getOrReturnCtx(input);
			const expectedValues = this._def.values;
			addIssueToContext(ctx, {
				expected: util.joinValues(expectedValues),
				received: ctx.parsedType,
				code: ZodIssueCode.invalid_type
			});
			return INVALID;
		}
		if (!this._cache) this._cache = new Set(this._def.values);
		if (!this._cache.has(input.data)) {
			const ctx = this._getOrReturnCtx(input);
			const expectedValues = this._def.values;
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_enum_value,
				options: expectedValues
			});
			return INVALID;
		}
		return OK(input.data);
	}
	get options() {
		return this._def.values;
	}
	get enum() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	get Values() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	get Enum() {
		const enumValues = {};
		for (const val of this._def.values) enumValues[val] = val;
		return enumValues;
	}
	extract(values, newDef = this._def) {
		return ZodEnum.create(values, {
			...this._def,
			...newDef
		});
	}
	exclude(values, newDef = this._def) {
		return ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
			...this._def,
			...newDef
		});
	}
};
ZodEnum.create = createZodEnum;
var ZodNativeEnum = class extends ZodType {
	_parse(input) {
		const nativeEnumValues = util.getValidEnumValues(this._def.values);
		const ctx = this._getOrReturnCtx(input);
		if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
			const expectedValues = util.objectValues(nativeEnumValues);
			addIssueToContext(ctx, {
				expected: util.joinValues(expectedValues),
				received: ctx.parsedType,
				code: ZodIssueCode.invalid_type
			});
			return INVALID;
		}
		if (!this._cache) this._cache = new Set(util.getValidEnumValues(this._def.values));
		if (!this._cache.has(input.data)) {
			const expectedValues = util.objectValues(nativeEnumValues);
			addIssueToContext(ctx, {
				received: ctx.data,
				code: ZodIssueCode.invalid_enum_value,
				options: expectedValues
			});
			return INVALID;
		}
		return OK(input.data);
	}
	get enum() {
		return this._def.values;
	}
};
ZodNativeEnum.create = (values, params) => {
	return new ZodNativeEnum({
		values,
		typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
		...processCreateParams(params)
	});
};
var ZodPromise = class extends ZodType {
	unwrap() {
		return this._def.type;
	}
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.promise,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return OK((ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data)).then((data) => {
			return this._def.type.parseAsync(data, {
				path: ctx.path,
				errorMap: ctx.common.contextualErrorMap
			});
		}));
	}
};
ZodPromise.create = (schema, params) => {
	return new ZodPromise({
		type: schema,
		typeName: ZodFirstPartyTypeKind.ZodPromise,
		...processCreateParams(params)
	});
};
var ZodEffects = class extends ZodType {
	innerType() {
		return this._def.schema;
	}
	sourceType() {
		return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
	}
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		const effect = this._def.effect || null;
		const checkCtx = {
			addIssue: (arg) => {
				addIssueToContext(ctx, arg);
				if (arg.fatal) status.abort();
				else status.dirty();
			},
			get path() {
				return ctx.path;
			}
		};
		checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
		if (effect.type === "preprocess") {
			const processed = effect.transform(ctx.data, checkCtx);
			if (ctx.common.async) return Promise.resolve(processed).then(async (processed) => {
				if (status.value === "aborted") return INVALID;
				const result = await this._def.schema._parseAsync({
					data: processed,
					path: ctx.path,
					parent: ctx
				});
				if (result.status === "aborted") return INVALID;
				if (result.status === "dirty") return DIRTY(result.value);
				if (status.value === "dirty") return DIRTY(result.value);
				return result;
			});
			else {
				if (status.value === "aborted") return INVALID;
				const result = this._def.schema._parseSync({
					data: processed,
					path: ctx.path,
					parent: ctx
				});
				if (result.status === "aborted") return INVALID;
				if (result.status === "dirty") return DIRTY(result.value);
				if (status.value === "dirty") return DIRTY(result.value);
				return result;
			}
		}
		if (effect.type === "refinement") {
			const executeRefinement = (acc) => {
				const result = effect.refinement(acc, checkCtx);
				if (ctx.common.async) return Promise.resolve(result);
				if (result instanceof Promise) throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
				return acc;
			};
			if (ctx.common.async === false) {
				const inner = this._def.schema._parseSync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inner.status === "aborted") return INVALID;
				if (inner.status === "dirty") status.dirty();
				executeRefinement(inner.value);
				return {
					status: status.value,
					value: inner.value
				};
			} else return this._def.schema._parseAsync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			}).then((inner) => {
				if (inner.status === "aborted") return INVALID;
				if (inner.status === "dirty") status.dirty();
				return executeRefinement(inner.value).then(() => {
					return {
						status: status.value,
						value: inner.value
					};
				});
			});
		}
		if (effect.type === "transform") if (ctx.common.async === false) {
			const base = this._def.schema._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			if (!isValid(base)) return INVALID;
			const result = effect.transform(base.value, checkCtx);
			if (result instanceof Promise) throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
			return {
				status: status.value,
				value: result
			};
		} else return this._def.schema._parseAsync({
			data: ctx.data,
			path: ctx.path,
			parent: ctx
		}).then((base) => {
			if (!isValid(base)) return INVALID;
			return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
				status: status.value,
				value: result
			}));
		});
		util.assertNever(effect);
	}
};
ZodEffects.create = (schema, effect, params) => {
	return new ZodEffects({
		schema,
		typeName: ZodFirstPartyTypeKind.ZodEffects,
		effect,
		...processCreateParams(params)
	});
};
ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
	return new ZodEffects({
		schema,
		effect: {
			type: "preprocess",
			transform: preprocess
		},
		typeName: ZodFirstPartyTypeKind.ZodEffects,
		...processCreateParams(params)
	});
};
var ZodOptional = class extends ZodType {
	_parse(input) {
		if (this._getType(input) === ZodParsedType.undefined) return OK(void 0);
		return this._def.innerType._parse(input);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodOptional.create = (type, params) => {
	return new ZodOptional({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodOptional,
		...processCreateParams(params)
	});
};
var ZodNullable = class extends ZodType {
	_parse(input) {
		if (this._getType(input) === ZodParsedType.null) return OK(null);
		return this._def.innerType._parse(input);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodNullable.create = (type, params) => {
	return new ZodNullable({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodNullable,
		...processCreateParams(params)
	});
};
var ZodDefault = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		let data = ctx.data;
		if (ctx.parsedType === ZodParsedType.undefined) data = this._def.defaultValue();
		return this._def.innerType._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
	}
	removeDefault() {
		return this._def.innerType;
	}
};
ZodDefault.create = (type, params) => {
	return new ZodDefault({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodDefault,
		defaultValue: typeof params.default === "function" ? params.default : () => params.default,
		...processCreateParams(params)
	});
};
var ZodCatch = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const newCtx = {
			...ctx,
			common: {
				...ctx.common,
				issues: []
			}
		};
		const result = this._def.innerType._parse({
			data: newCtx.data,
			path: newCtx.path,
			parent: { ...newCtx }
		});
		if (isAsync(result)) return result.then((result) => {
			return {
				status: "valid",
				value: result.status === "valid" ? result.value : this._def.catchValue({
					get error() {
						return new ZodError(newCtx.common.issues);
					},
					input: newCtx.data
				})
			};
		});
		else return {
			status: "valid",
			value: result.status === "valid" ? result.value : this._def.catchValue({
				get error() {
					return new ZodError(newCtx.common.issues);
				},
				input: newCtx.data
			})
		};
	}
	removeCatch() {
		return this._def.innerType;
	}
};
ZodCatch.create = (type, params) => {
	return new ZodCatch({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodCatch,
		catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
		...processCreateParams(params)
	});
};
var ZodNaN = class extends ZodType {
	_parse(input) {
		if (this._getType(input) !== ZodParsedType.nan) {
			const ctx = this._getOrReturnCtx(input);
			addIssueToContext(ctx, {
				code: ZodIssueCode.invalid_type,
				expected: ZodParsedType.nan,
				received: ctx.parsedType
			});
			return INVALID;
		}
		return {
			status: "valid",
			value: input.data
		};
	}
};
ZodNaN.create = (params) => {
	return new ZodNaN({
		typeName: ZodFirstPartyTypeKind.ZodNaN,
		...processCreateParams(params)
	});
};
var ZodBranded = class extends ZodType {
	_parse(input) {
		const { ctx } = this._processInputParams(input);
		const data = ctx.data;
		return this._def.type._parse({
			data,
			path: ctx.path,
			parent: ctx
		});
	}
	unwrap() {
		return this._def.type;
	}
};
var ZodPipeline = class ZodPipeline extends ZodType {
	_parse(input) {
		const { status, ctx } = this._processInputParams(input);
		if (ctx.common.async) {
			const handleAsync = async () => {
				const inResult = await this._def.in._parseAsync({
					data: ctx.data,
					path: ctx.path,
					parent: ctx
				});
				if (inResult.status === "aborted") return INVALID;
				if (inResult.status === "dirty") {
					status.dirty();
					return DIRTY(inResult.value);
				} else return this._def.out._parseAsync({
					data: inResult.value,
					path: ctx.path,
					parent: ctx
				});
			};
			return handleAsync();
		} else {
			const inResult = this._def.in._parseSync({
				data: ctx.data,
				path: ctx.path,
				parent: ctx
			});
			if (inResult.status === "aborted") return INVALID;
			if (inResult.status === "dirty") {
				status.dirty();
				return {
					status: "dirty",
					value: inResult.value
				};
			} else return this._def.out._parseSync({
				data: inResult.value,
				path: ctx.path,
				parent: ctx
			});
		}
	}
	static create(a, b) {
		return new ZodPipeline({
			in: a,
			out: b,
			typeName: ZodFirstPartyTypeKind.ZodPipeline
		});
	}
};
var ZodReadonly = class extends ZodType {
	_parse(input) {
		const result = this._def.innerType._parse(input);
		const freeze = (data) => {
			if (isValid(data)) data.value = Object.freeze(data.value);
			return data;
		};
		return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
	}
	unwrap() {
		return this._def.innerType;
	}
};
ZodReadonly.create = (type, params) => {
	return new ZodReadonly({
		innerType: type,
		typeName: ZodFirstPartyTypeKind.ZodReadonly,
		...processCreateParams(params)
	});
};
ZodObject.lazycreate;
var ZodFirstPartyTypeKind;
(function(ZodFirstPartyTypeKind) {
	ZodFirstPartyTypeKind["ZodString"] = "ZodString";
	ZodFirstPartyTypeKind["ZodNumber"] = "ZodNumber";
	ZodFirstPartyTypeKind["ZodNaN"] = "ZodNaN";
	ZodFirstPartyTypeKind["ZodBigInt"] = "ZodBigInt";
	ZodFirstPartyTypeKind["ZodBoolean"] = "ZodBoolean";
	ZodFirstPartyTypeKind["ZodDate"] = "ZodDate";
	ZodFirstPartyTypeKind["ZodSymbol"] = "ZodSymbol";
	ZodFirstPartyTypeKind["ZodUndefined"] = "ZodUndefined";
	ZodFirstPartyTypeKind["ZodNull"] = "ZodNull";
	ZodFirstPartyTypeKind["ZodAny"] = "ZodAny";
	ZodFirstPartyTypeKind["ZodUnknown"] = "ZodUnknown";
	ZodFirstPartyTypeKind["ZodNever"] = "ZodNever";
	ZodFirstPartyTypeKind["ZodVoid"] = "ZodVoid";
	ZodFirstPartyTypeKind["ZodArray"] = "ZodArray";
	ZodFirstPartyTypeKind["ZodObject"] = "ZodObject";
	ZodFirstPartyTypeKind["ZodUnion"] = "ZodUnion";
	ZodFirstPartyTypeKind["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
	ZodFirstPartyTypeKind["ZodIntersection"] = "ZodIntersection";
	ZodFirstPartyTypeKind["ZodTuple"] = "ZodTuple";
	ZodFirstPartyTypeKind["ZodRecord"] = "ZodRecord";
	ZodFirstPartyTypeKind["ZodMap"] = "ZodMap";
	ZodFirstPartyTypeKind["ZodSet"] = "ZodSet";
	ZodFirstPartyTypeKind["ZodFunction"] = "ZodFunction";
	ZodFirstPartyTypeKind["ZodLazy"] = "ZodLazy";
	ZodFirstPartyTypeKind["ZodLiteral"] = "ZodLiteral";
	ZodFirstPartyTypeKind["ZodEnum"] = "ZodEnum";
	ZodFirstPartyTypeKind["ZodEffects"] = "ZodEffects";
	ZodFirstPartyTypeKind["ZodNativeEnum"] = "ZodNativeEnum";
	ZodFirstPartyTypeKind["ZodOptional"] = "ZodOptional";
	ZodFirstPartyTypeKind["ZodNullable"] = "ZodNullable";
	ZodFirstPartyTypeKind["ZodDefault"] = "ZodDefault";
	ZodFirstPartyTypeKind["ZodCatch"] = "ZodCatch";
	ZodFirstPartyTypeKind["ZodPromise"] = "ZodPromise";
	ZodFirstPartyTypeKind["ZodBranded"] = "ZodBranded";
	ZodFirstPartyTypeKind["ZodPipeline"] = "ZodPipeline";
	ZodFirstPartyTypeKind["ZodReadonly"] = "ZodReadonly";
})(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
var stringType = ZodString.create;
var numberType = ZodNumber.create;
ZodNaN.create;
ZodBigInt.create;
var booleanType = ZodBoolean.create;
ZodDate.create;
ZodSymbol.create;
ZodUndefined.create;
ZodNull.create;
ZodAny.create;
ZodUnknown.create;
ZodNever.create;
ZodVoid.create;
var arrayType = ZodArray.create;
var objectType = ZodObject.create;
ZodObject.strictCreate;
var unionType = ZodUnion.create;
ZodDiscriminatedUnion.create;
ZodIntersection.create;
ZodTuple.create;
ZodRecord.create;
ZodMap.create;
ZodSet.create;
ZodFunction.create;
ZodLazy.create;
var literalType = ZodLiteral.create;
var enumType = ZodEnum.create;
ZodNativeEnum.create;
ZodPromise.create;
ZodEffects.create;
ZodOptional.create;
ZodNullable.create;
ZodEffects.createWithPreprocess;
ZodPipeline.create;
var coerce = {
	string: ((arg) => ZodString.create({
		...arg,
		coerce: true
	})),
	number: ((arg) => ZodNumber.create({
		...arg,
		coerce: true
	})),
	boolean: ((arg) => ZodBoolean.create({
		...arg,
		coerce: true
	})),
	bigint: ((arg) => ZodBigInt.create({
		...arg,
		coerce: true
	})),
	date: ((arg) => ZodDate.create({
		...arg,
		coerce: true
	}))
};
//#endregion
//#region data/initial-import.json
var initial_import_default = /* @__PURE__ */ JSON.parse("[{\"id\":\"import-project-cuboid\",\"kind\":\"project\",\"data\":{\"name\":\"3D Cuboid · KPI hiện tại\",\"description\":\"Nhập từ KPI_Ngay. Tên dự án gốc chưa được ghi trong nguồn; Lead có thể đổi tên.\",\"instructions\":\"Theo hướng dẫn annotation của team. Chỉ tiêu gốc: 1.200 cuboid/ngày. QA/QC phân bổ 50% annotation và 50% QC. Sản lượng lịch sử là số cuboid quy đổi ID × frame theo công thức trong sheet, chưa phải kết quả nghiệm thu QC.\",\"unit\":\"cuboid\",\"target\":1200,\"targetPeriod\":\"day\",\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceCell\":\"'Bao cao tuan'!B4\",\"imported\":true},\"status\":\"active\"},{\"id\":\"import-daily-member-1-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1241\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":840,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":14.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1241\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B3:F3\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-1\",\"date\":\"2026-10-20\",\"natural_key\":\"member-1:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-1-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1241\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1200,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":34.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1241\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G3:K3\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-1\",\"date\":\"2026-10-21\",\"natural_key\":\"member-1:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-2-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1264\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1200,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":20.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1264\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B4:F4\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-2\",\"date\":\"2026-10-20\",\"natural_key\":\"member-2:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-2-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1264\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1140,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":39.0,\"sourceFrames\":60.0,\"sourceTaskId\":null,\"taskIdInherited\":true,\"sourceRange\":\"Tuan1!G4:K4\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-2\",\"date\":\"2026-10-21\",\"natural_key\":\"member-2:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-3-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1198\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1020,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"frame 36 nhé bị nhảy objID 15 => 73\\nvì ko quy định ko xóa ID và ID 15 vẫn ở đấy thì xử lý ntn\",\"evidence\":\"\",\"sourceIds\":17.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1198\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B5:F5\"}],\"completed\":\"\",\"blockers\":\"frame 36 nhé bị nhảy objID 15 => 73\\nvì ko quy định ko xóa ID và ID 15 vẫn ở đấy thì xử lý ntn\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-3\",\"date\":\"2026-10-20\",\"natural_key\":\"member-3:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-3-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1198\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1260,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":38.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1198\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G5:K5\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-3\",\"date\":\"2026-10-21\",\"natural_key\":\"member-3:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-4-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1202\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":0,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"làm tới ID 17 rework 11h30 21/10\",\"evidence\":\"\",\"sourceIds\":0.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1202\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B6:F6\"}],\"completed\":\"\",\"blockers\":\"làm tới ID 17 rework 11h30 21/10\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-4\",\"date\":\"2026-10-20\",\"natural_key\":\"member-4:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-4-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1202\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":780,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":13.0,\"sourceFrames\":60.0,\"sourceTaskId\":null,\"taskIdInherited\":true,\"sourceRange\":\"Tuan1!G6:K6\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-4\",\"date\":\"2026-10-21\",\"natural_key\":\"member-4:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-5-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1233\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":0,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"làm tới ID 11 rework\",\"evidence\":\"\",\"sourceIds\":0.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1233\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B7:F7\"}],\"completed\":\"\",\"blockers\":\"làm tới ID 11 rework\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-5\",\"date\":\"2026-10-20\",\"natural_key\":\"member-5:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-5-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1233\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":720,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":12.0,\"sourceFrames\":60.0,\"sourceTaskId\":null,\"taskIdInherited\":true,\"sourceRange\":\"Tuan1!G7:K7\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-5\",\"date\":\"2026-10-21\",\"natural_key\":\"member-5:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-6-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1203\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1200,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"hôm nay chưa có\",\"evidence\":\"\",\"sourceIds\":20.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1203\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B8:F8\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-6\",\"date\":\"2026-10-20\",\"natural_key\":\"member-6:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-6-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1203\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1500,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"33,38 và 45 bị trùng người\",\"evidence\":\"\",\"sourceIds\":45.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1203\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G8:K8\"}],\"completed\":\"\",\"blockers\":\"33,38 và 45 bị trùng người\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-6\",\"date\":\"2026-10-21\",\"natural_key\":\"member-6:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-7-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1285\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":180,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":3.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1285\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B9:F9\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-7\",\"date\":\"2026-10-20\",\"natural_key\":\"member-7:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-7-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1285\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1380,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":26.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1285\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G9:K9\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-7\",\"date\":\"2026-10-21\",\"natural_key\":\"member-7:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-8-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1255\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":300,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"Hiện chưa có\",\"evidence\":\"\",\"sourceIds\":5.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1255\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B10:F10\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-8\",\"date\":\"2026-10-20\",\"natural_key\":\"member-8:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-8-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1255\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1980,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"Frame 31 -> 32, pedestrian id 33 và pedestrian id 38 gán trùng 1 object, không rõ nên đánh id 33 hay id 38 outside.\",\"evidence\":\"\",\"sourceIds\":38.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1255\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G10:K10\"}],\"completed\":\"\",\"blockers\":\"Frame 31 -> 32, pedestrian id 33 và pedestrian id 38 gán trùng 1 object, không rõ nên đánh id 33 hay id 38 outside.\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-8\",\"date\":\"2026-10-21\",\"natural_key\":\"member-8:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-daily-member-9-2026-10-20\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-20\",\"lines\":[{\"taskId\":\"import-task-1517\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":780,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"\",\"evidence\":\"\",\"sourceIds\":13.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1517\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!B11:F11\"}],\"completed\":\"\",\"blockers\":\"\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-9\",\"date\":\"2026-10-20\",\"natural_key\":\"member-9:2026-10-20\",\"status\":\"imported\"},{\"id\":\"import-daily-member-9-2026-10-21\",\"kind\":\"daily\",\"data\":{\"date\":\"2026-10-21\",\"lines\":[{\"taskId\":\"import-task-1517\",\"activity\":\"annotation\",\"minutes\":null,\"quantity\":1320,\"rework\":null,\"quantityClassification\":\"net_daily_confirmed_by_lead\",\"work\":\"Sản lượng theo KPI_Ngay (ID × frame)\",\"issue\":\"ID 33 và các id pedestrian bị lẫn lộn với nhau, không thể phân biệt được\",\"evidence\":\"\",\"sourceIds\":35.0,\"sourceFrames\":60.0,\"sourceTaskId\":\"1517\",\"taskIdInherited\":false,\"sourceRange\":\"Tuan1!G11:K11\"}],\"completed\":\"\",\"blockers\":\"ID 33 và các id pedestrian bị lẫn lộn với nhau, không thể phân biệt được\",\"support\":\"\",\"nextPlan\":\"\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\",\"sourceState\":\"Chưa duyệt\",\"missingFields\":[\"Thời gian thực tế\"],\"quantityMethod\":\"Giá trị sản lượng ngày trong sheet; ngày 21/10 dùng (ID cộng dồn - ID ngày trước) × số frame, không cộng ID cộng dồn trực tiếp.\"},\"owner_id\":\"member-9\",\"date\":\"2026-10-21\",\"natural_key\":\"member-9:2026-10-21\",\"status\":\"imported\"},{\"id\":\"import-task-1241\",\"kind\":\"task\",\"data\":{\"code\":\"1241\",\"title\":\"Annotation 3D Cuboid · Task 1241\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-1\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1241\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2040,\"reportedTotal\":2040,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1241:\",\"status\":\"doing\"},{\"id\":\"import-task-1264\",\"kind\":\"task\",\"data\":{\"code\":\"1264\",\"title\":\"Annotation 3D Cuboid · Task 1264\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-2\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1264\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2340,\"reportedTotal\":2340,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1264:\",\"status\":\"doing\"},{\"id\":\"import-task-1198\",\"kind\":\"task\",\"data\":{\"code\":\"1198\",\"title\":\"Annotation 3D Cuboid · Task 1198\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-3\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1198\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2280,\"reportedTotal\":2280,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1198:\",\"status\":\"doing\"},{\"id\":\"import-task-1202\",\"kind\":\"task\",\"data\":{\"code\":\"1202\",\"title\":\"Annotation 3D Cuboid · Task 1202\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-4\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1202\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":780,\"reportedTotal\":780,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1202:\",\"status\":\"doing\"},{\"id\":\"import-task-1233\",\"kind\":\"task\",\"data\":{\"code\":\"1233\",\"title\":\"Annotation 3D Cuboid · Task 1233\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-5\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1233\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":720,\"reportedTotal\":720,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1233:\",\"status\":\"doing\"},{\"id\":\"import-task-1203\",\"kind\":\"task\",\"data\":{\"code\":\"1203\",\"title\":\"Annotation 3D Cuboid · Task 1203\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-6\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1203\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2700,\"reportedTotal\":2700,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1203:\",\"status\":\"doing\"},{\"id\":\"import-task-1285\",\"kind\":\"task\",\"data\":{\"code\":\"1285\",\"title\":\"Annotation 3D Cuboid · Task 1285\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-7\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1285\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":1560,\"reportedTotal\":1560,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1285:\",\"status\":\"doing\"},{\"id\":\"import-task-1255\",\"kind\":\"task\",\"data\":{\"code\":\"1255\",\"title\":\"Annotation 3D Cuboid · Task 1255\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-8\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1255\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2280,\"reportedTotal\":2280,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1255:\",\"status\":\"doing\"},{\"id\":\"import-task-1517\",\"kind\":\"task\",\"data\":{\"code\":\"1517\",\"title\":\"Annotation 3D Cuboid · Task 1517\",\"projectId\":\"import-project-cuboid\",\"assigneeId\":\"member-9\",\"reviewerId\":\"member-0\",\"link\":\"https://cvat-test.vantixapps.net/tasks/1517\",\"assignedDate\":\"2026-10-20\",\"assignedDateEstimated\":true,\"deadline\":null,\"priority\":\"normal\",\"quantity\":null,\"completed\":2100,\"reportedTotal\":2100,\"latestProductionDate\":\"2026-10-21\",\"note\":\"Dữ liệu nhập từ sheet. Chưa có khối lượng giao và deadline. Lead cần bổ sung trước khi tiếp tục workflow. Người kiểm tra tạm giao Lead vì chưa chọn QA/QC.\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"},\"project_id\":\"import-project-cuboid\",\"natural_key\":\"1517:\",\"status\":\"doing\"},{\"id\":\"import-attendance-member-1-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B3\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-1\",\"date\":\"2026-10-20\",\"natural_key\":\"member-1:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-1-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F3\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-1\",\"date\":\"2026-10-21\",\"natural_key\":\"member-1:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-1-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J3\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-1\",\"date\":\"2026-10-22\",\"natural_key\":\"member-1:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-2-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B4\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-2\",\"date\":\"2026-10-20\",\"natural_key\":\"member-2:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-2-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F4\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-2\",\"date\":\"2026-10-21\",\"natural_key\":\"member-2:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-2-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J4\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-2\",\"date\":\"2026-10-22\",\"natural_key\":\"member-2:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-3-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B5\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-3\",\"date\":\"2026-10-20\",\"natural_key\":\"member-3:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-3-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F5\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-3\",\"date\":\"2026-10-21\",\"natural_key\":\"member-3:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-3-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J5\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-3\",\"date\":\"2026-10-22\",\"natural_key\":\"member-3:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-4-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B6\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-4\",\"date\":\"2026-10-20\",\"natural_key\":\"member-4:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-4-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F6\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-4\",\"date\":\"2026-10-21\",\"natural_key\":\"member-4:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-4-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J6\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-4\",\"date\":\"2026-10-22\",\"natural_key\":\"member-4:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-5-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B7\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-5\",\"date\":\"2026-10-20\",\"natural_key\":\"member-5:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-5-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F7\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-5\",\"date\":\"2026-10-21\",\"natural_key\":\"member-5:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-5-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J7\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-5\",\"date\":\"2026-10-22\",\"natural_key\":\"member-5:2026-10-22\",\"status\":\"leave\"},{\"id\":\"import-attendance-member-6-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B8\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-6\",\"date\":\"2026-10-20\",\"natural_key\":\"member-6:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-6-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":19.0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F8\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-6\",\"date\":\"2026-10-21\",\"natural_key\":\"member-6:2026-10-21\",\"status\":\"late\"},{\"id\":\"import-attendance-member-6-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":13.0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J8\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-6\",\"date\":\"2026-10-22\",\"natural_key\":\"member-6:2026-10-22\",\"status\":\"late\"},{\"id\":\"import-attendance-member-7-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B9\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-7\",\"date\":\"2026-10-20\",\"natural_key\":\"member-7:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-7-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F9\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-7\",\"date\":\"2026-10-21\",\"natural_key\":\"member-7:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-7-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J9\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-7\",\"date\":\"2026-10-22\",\"natural_key\":\"member-7:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-8-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B10\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-8\",\"date\":\"2026-10-20\",\"natural_key\":\"member-8:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-8-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F10\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-8\",\"date\":\"2026-10-21\",\"natural_key\":\"member-8:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-8-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J10\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-8\",\"date\":\"2026-10-22\",\"natural_key\":\"member-8:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-attendance-member-9-2026-10-20\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!B11\",\"originalDate\":\"2026-10-20\",\"dateCorrection\":null},\"owner_id\":\"member-9\",\"date\":\"2026-10-20\",\"natural_key\":\"member-9:2026-10-20\",\"status\":\"present\"},{\"id\":\"import-attendance-member-9-2026-10-21\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":\"Đúng quy định\",\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!F11\",\"originalDate\":\"2026-11-21\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-9\",\"date\":\"2026-10-21\",\"natural_key\":\"member-9:2026-10-21\",\"status\":\"present\"},{\"id\":\"import-attendance-member-9-2026-10-22\",\"kind\":\"attendance\",\"data\":{\"checkIn\":null,\"checkOut\":null,\"note\":\"\",\"lateMinutes\":0,\"conduct\":null,\"imported\":true,\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"sourceRange\":\"'Diem danh va tac phong'!J11\",\"originalDate\":\"2026-11-22\",\"dateCorrection\":\"Ngày 21/11 và 22/11 được người dùng xác nhận sửa thành 21/10 và 22/10.\"},\"owner_id\":\"member-9\",\"date\":\"2026-10-22\",\"natural_key\":\"member-9:2026-10-22\",\"status\":\"present\"},{\"id\":\"import-undated-weekly\",\"kind\":\"legacy\",\"data\":{\"title\":\"2 ghi nhận rework chưa có tuần\",\"source\":\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"rows\":[{\"memberId\":\"member-4\",\"cell\":\"'Bao cao tuan'!L11\",\"reworkTasks\":1},{\"memberId\":\"member-5\",\"cell\":\"'Bao cao tuan'!L12\",\"reworkTasks\":1}],\"note\":\"Nguồn chưa điền ngày bắt đầu tuần; giữ riêng, chưa cộng vào weekly report.\"},\"status\":\"needs_date\"},{\"id\":\"import-manifest\",\"kind\":\"import\",\"data\":{\"title\":\"Nhập dữ liệu từ Google Sheets\",\"sources\":[\"https://docs.google.com/spreadsheets/d/1tB3LUSJmHs6ZwZ1V5lKsyUEtoZQUnY3i/edit?gid=1078651171\",\"https://docs.google.com/spreadsheets/d/1QpNIXP0umu9pTgd6-JiX_uJRrx_OAzMq/edit?gid=905526587\"],\"totals\":{\"2026-10-20\":5520,\"2026-10-21\":11280},\"reportCount\":18,\"taskCount\":9,\"attendanceCount\":27,\"notes\":[\"Cầm Vũ Ngọc Thạch → Cẩm Vũ Ngọc Thạch; Phạm Nguyễn Tuấn → Phạm Nguyễn Tuân theo danh sách nhân sự người dùng.\",\"Ngày điểm danh 21/11, 22/11 → 21/10, 22/10 theo xác nhận người dùng.\",\"Tổng sản lượng từng ngày đã được Lead xác nhận trừ phần lỗi. QC thường vào sáng hôm sau; không tự tạo kết quả QC.\",\"Báo cáo lịch sử chưa có thời gian thực tế, chưa được duyệt.\",\"Không tạo dữ liệu cho các ô trống hoặc các tuần tương lai.\",\"2 ghi nhận rework thiếu ngày tuần được giữ riêng.\",\"Chưa nhập điểm Quality vì không có mẫu số kiểm tra.\"],\"issues\":[{\"memberId\":\"member-3\",\"date\":\"2026-10-20\",\"text\":\"frame 36 nhé bị nhảy objID 15 => 73\\nvì ko quy định ko xóa ID và ID 15 vẫn ở đấy thì xử lý ntn\",\"taskId\":\"import-task-1198\"},{\"memberId\":\"member-4\",\"date\":\"2026-10-20\",\"text\":\"làm tới ID 17 rework 11h30 21/10\",\"taskId\":\"import-task-1202\"},{\"memberId\":\"member-5\",\"date\":\"2026-10-20\",\"text\":\"làm tới ID 11 rework\",\"taskId\":\"import-task-1233\"},{\"memberId\":\"member-6\",\"date\":\"2026-10-21\",\"text\":\"33,38 và 45 bị trùng người\",\"taskId\":\"import-task-1203\"},{\"memberId\":\"member-8\",\"date\":\"2026-10-21\",\"text\":\"Frame 31 -> 32, pedestrian id 33 và pedestrian id 38 gán trùng 1 object, không rõ nên đánh id 33 hay id 38 outside.\",\"taskId\":\"import-task-1255\"},{\"memberId\":\"member-9\",\"date\":\"2026-10-21\",\"text\":\"ID 33 và các id pedestrian bị lẫn lộn với nhau, không thể phân biệt được\",\"taskId\":\"import-task-1517\"}]},\"status\":\"completed\"}]");
//#endregion
//#region lib/reported-qc.ts
var amount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e8;
function reportedQc(report) {
	const data = report?.data.qcActivity;
	if (!data || report?.data.scoped || data.version !== 1 || data.verifiedBy !== "member-0") return null;
	if (data.jobs !== null && (!Number.isSafeInteger(data.jobs) || data.jobs < 0 || data.jobs > 1e3)) return null;
	if (data.cuboids !== null && !amount(data.cuboids)) return null;
	if (!amount(data.kpiCuboids) || data.kpiCuboids > (data.cuboids || 0)) return null;
	const jobIds = [...new Set((Array.isArray(data.jobIds) ? data.jobIds : []).filter((id) => typeof id === "string" && /^\d{1,30}$/.test(id)))];
	return {
		jobs: data.jobs,
		jobIds,
		cuboids: data.cuboids,
		kpiCuboids: data.kpiCuboids,
		checkedIds: amount(data.checkedIds) ? data.checkedIds : null,
		note: typeof data.note === "string" ? data.note : ""
	};
}
function reportedQcStats(report, actualJobIds, actualRounds = actualJobIds.length) {
	const activity = reportedQc(report), actual = new Set(actualJobIds.filter(Boolean)), known = new Set([...actual, ...activity?.jobIds || []]), count = Math.max(known.size, activity?.jobs || 0);
	return {
		jobs: !!activity && activity.jobs === null && !known.size ? null : count,
		rounds: actualRounds + Math.max(0, count - actual.size),
		cuboids: activity?.cuboids ?? null,
		kpiCuboids: activity?.kpiCuboids || 0,
		activity
	};
}
function reportedQcLabel(report) {
	const qc = reportedQc(report);
	if (!qc) return "";
	const n = (value) => value.toLocaleString("vi-VN");
	return [
		"QC đã báo cáo",
		qc.jobs === null ? "Chưa ghi số bài" : n(qc.jobs) + " bài",
		qc.jobIds.length ? "Job " + qc.jobIds.join(", ") : "Chưa ghi Job ID",
		qc.checkedIds !== null ? n(qc.checkedIds) + " ID đã kiểm" : "",
		qc.cuboids !== null ? n(qc.cuboids) + " cuboid QC" : "",
		qc.kpiCuboids ? n(qc.kpiCuboids) + " cuboid được tính KPI" : "",
		qc.note
	].filter(Boolean).join(" · ");
}
//#endregion
//#region lib/kpi.ts
var DAILY_CUBOID_TARGET = 1200;
var vietnamToday = () => new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit"
}).format(/* @__PURE__ */ new Date());
var add$1 = (d, n) => {
	const v = /* @__PURE__ */ new Date(d + "T12:00:00Z");
	v.setUTCDate(v.getUTCDate() + n);
	return v.toISOString().slice(0, 10);
};
function scheduledWorkday(day, settings = {}) {
	const weekday = (/* @__PURE__ */ new Date(day + "T12:00:00Z")).getUTCDay();
	return weekday !== 0 && (weekday !== 6 || Math.abs(Math.round((Date.parse(day) - Date.parse(settings.kpiWorkingSaturday || "2026-10-24")) / 864e5 / 7)) % 2 === 0);
}
function previousWorkday(day, settings = {}) {
	let d = add$1(day, -1);
	while (!scheduledWorkday(d, settings)) d = add$1(d, -1);
	return d;
}
function nextWorkday(day, settings = {}) {
	let d = add$1(day, 1);
	while (!scheduledWorkday(d, settings)) d = add$1(d, 1);
	return d;
}
function dailyRate(memberId, day, records) {
	const rate = records.filter((r) => r.kind === "kpi-rate" && r.owner_id === memberId && r.status === "active" && r.date <= day).sort((a, b) => b.date.localeCompare(a.date))[0];
	return rate ? Number(rate.data.quantity) : DAILY_CUBOID_TARGET;
}
function kpiDayTarget(day, memberId, records, settings = {}) {
	const config = Object.keys(settings).length ? settings : records.find((r) => r.id === "settings")?.data || {};
	if (day < (config.kpiStartDate || "2026-10-20") || !scheduledWorkday(day, config)) return 0;
	if (records.some((r) => r.kind === "kpi-exclusion" && r.status === "active" && r.date === day && (!r.owner_id || r.owner_id === memberId))) return 0;
	return dailyRate(memberId, day, records);
}
function dailyKpi(report, records) {
	const cuboid = (report.data.lines || []).filter((l) => l.activity !== "qc").filter((l) => {
		const task = records.find((t) => t.kind === "task" && t.id === l.taskId);
		return records.some((p) => p.kind === "project" && p.id === task?.project_id && p.data.unit === "cuboid");
	});
	const qcCredit = reportedQc(report)?.kpiCuboids || 0;
	const quantity = cuboid.reduce((n, l) => n + (Number(l.quantity) || 0), 0) + qcCredit, applicable = (cuboid.length > 0 || qcCredit > 0) && !report.data.scoped, day = report.date || report.data.date;
	const target = day ? kpiDayTarget(day, report.owner_id, records) : DAILY_CUBOID_TARGET, pending = cuboid.some((l) => l.productionPending);
	return {
		quantity,
		target,
		remaining: applicable && !pending ? Math.max(0, target - quantity) : null,
		ratio: applicable && target && !pending ? quantity / target : null,
		result: pending ? "Chờ bảng đếm" : !applicable ? report.data.scoped ? "Chỉ xem một phần" : "Không áp dụng" : target === 0 ? "Không tính KPI" : quantity >= target ? "Đạt" : "Chưa đạt",
		applicable,
		pending
	};
}
function cumulativeKpi(memberId, records, end = vietnamToday()) {
	const config = records.find((r) => r.id === "settings")?.data || {}, start = config.kpiStartDate || "2026-10-20";
	let target = 0, days = 0;
	for (let d = start; d <= end; d = add$1(d, 1)) {
		const value = kpiDayTarget(d, memberId, records, config);
		target += value;
		if (value) days++;
	}
	const reports = records.filter((r) => r.kind === "daily" && r.owner_id === memberId && r.date >= start && r.date <= end && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status) && !r.data.scoped);
	const quantity = reports.reduce((n, r) => n + dailyKpi(r, records).quantity, 0), pendingReports = reports.filter((r) => dailyKpi(r, records).pending).length;
	return {
		start,
		end,
		target,
		days,
		quantity,
		pendingReports,
		currentRate: dailyRate(memberId, end, records),
		remaining: Math.max(0, target - quantity),
		ratio: target && !pendingReports ? quantity / target : null,
		result: pendingReports ? "Chờ bảng đếm" : !target ? "Không tính KPI" : quantity >= target ? "Đạt" : "Chưa đạt"
	};
}
function weeklyKpi(memberId, records, asOf = vietnamToday()) {
	const start = add$1(asOf, -(((/* @__PURE__ */ new Date(asOf + "T12:00:00Z")).getUTCDay() + 6) % 7)), end = add$1(start, 6);
	let target = 0, days = 0, targetToDate = 0;
	for (let d = start; d <= end; d = add$1(d, 1)) {
		const value = kpiDayTarget(d, memberId, records);
		target += value;
		if (value) days++;
		if (d <= asOf) targetToDate += value;
	}
	const reports = records.filter((r) => r.kind === "daily" && r.owner_id === memberId && r.date >= start && r.date <= asOf && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status) && !r.data.scoped);
	const quantity = reports.reduce((n, r) => n + dailyKpi(r, records).quantity, 0), pendingReports = reports.filter((r) => dailyKpi(r, records).pending).length;
	return {
		start,
		end,
		asOf,
		target,
		targetToDate,
		days,
		quantity,
		pendingReports,
		currentRate: dailyRate(memberId, asOf, records),
		remaining: Math.max(0, target - quantity),
		ratio: target && !pendingReports ? quantity / target : null,
		result: pendingReports ? "Chờ bảng đếm" : !target ? "Không tính KPI" : quantity >= target ? "Đạt" : "Chưa đạt"
	};
}
//#endregion
//#region lib/report-progress.ts
function reportEndId(line) {
	if (line.endId != null && /^\d{1,30}$/.test(String(line.endId))) return String(line.endId);
	if (!line.sourceRange || !Number.isSafeInteger(line.sourceIds) || line.sourceIds < 0) return "";
	const noted = line.sourceIds === 0 ? String(line.issue || "").match(/^\s*làm tới ID\s+(\d{1,30})\b/i) : null;
	return noted ? noted[1] : String(line.sourceIds);
}
//#endregion
//#region lib/qc.ts
var qcDay = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit"
}).format(new Date(value)) : "";
function reworkDays(reviews) {
	return [...new Set(reviews.filter((r) => r.status === "changes" || r.data.verdict === "changes").map((r) => qcDay(r.data.checkedAt) || r.date).filter((d) => !!d))].sort();
}
function pendingQcErrors(records, taskId) {
	return records.filter((r) => r.kind === "review" && r.data.mode === "daily" && r.task_id === taskId).flatMap((r) => (r.data.errors || []).flatMap((e, index) => e.verification ? [] : [{
		key: r.id + ":" + index,
		reviewId: r.id,
		index,
		date: r.date,
		description: e.description,
		type: e.type,
		severity: e.severity,
		objectId: e.objectId || "",
		frameId: e.frameId || "",
		frameEnd: e.frameEnd || "",
		code: e.code || "L",
		evidence: e.evidence || "",
		fixed: !!e.fixed,
		fixedAt: e.fixedAt || null,
		fixNote: e.fixNote || ""
	}]));
}
//#endregion
//#region lib/evaluation.ts
var EVALUATION_RULES = [
	["Sản lượng", "Chỉ cộng cuboid annotation trong báo cáo đã gửi, đã duyệt hoặc dữ liệu lịch sử đang giữ. Nháp không được tính. QC và sửa lỗi không tự cộng sản lượng mới; các khối lượng được Lead xác nhận tính KPI giữ đúng số đã duyệt."],
	["KPI", "Cộng mục tiêu từng ngày trong kỳ theo lịch công ty, mức riêng và ngày miễn KPI. Lead không có bài annotation hoặc mức KPI riêng hiển thị Không áp dụng."],
	["Task/Job hoàn thành", "Mỗi cặp Task ID/Job ID được giao là một bài. Chỉ tính bài đã đạt QC và có thời điểm hoàn thành trong kỳ (UTC+7)."],
	["Rework", "Mỗi người mỗi ngày có lỗi cộng 1 rework. Cùng ngày chỉ tính 1 dù nhiều lỗi, nhiều Job hoặc nhiều log. Hôm sau còn lỗi cũ thì cộng 1 cho ngày hôm sau. Tính theo ngày QC (UTC+7), không theo ngày sản lượng."],
	["Chất lượng", "Tỷ lệ đạt lần đầu = cuboid đạt / cuboid đã kiểm ở lượt QC đầu tiên trong kỳ. Không cộng lượt kiểm lại hoặc trộn frame/scene với cuboid."],
	["Chuyên cần", "Đi trễ, vắng, nghỉ phép và nghỉ nửa ngày tách riêng. Có mặt quy đổi = có mặt đủ ngày + đi trễ + 0,5 × nửa ngày. Không dùng để tự tính lương hoặc điểm đánh giá."],
	["Thiếu dữ liệu", "Không suy ra phút trễ, giờ công hoặc ngày hoàn thành còn thiếu. Rework chưa có ngày không được cộng vào kỳ. Điểm danh/tác phong mặc định được ghi rõ trong phần chi tiết."]
];
var inRange = (day, from, to) => !!day && day >= from && day <= to;
var dayOf$1 = (s) => {
	if (typeof s !== "string" || !Number.isFinite(Date.parse(s))) return "";
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(new Date(s));
};
var next = (day) => {
	const d = /* @__PURE__ */ new Date(day + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
};
var numeric = (v) => typeof v === "number" && Number.isFinite(v);
var n = (v) => numeric(v) ? v : 0;
var sum = (values) => values.reduce((s, v) => s + v, 0);
var REPORT_STATES = [
	"submitted",
	"approved",
	"imported"
];
function buildTeamEvaluation(members, records, from, to) {
	const settings = records.find((r) => r.id === "settings")?.data || {}, taskMap = new Map(records.filter((r) => r.kind === "task").map((r) => [r.id, r])), projectMap = new Map(records.filter((r) => r.kind === "project").map((r) => [r.id, r]));
	const dated = records.filter((r) => ["attendance", "daily"].includes(r.kind) && r.date).map((r) => r.date);
	const trackingStart = [settings.kpiStartDate || "2026-10-20", ...dated].sort()[0];
	const days = [];
	for (let day = from; day <= to; day = next(day)) days.push(day);
	return members.map((member) => {
		const jobs = [...taskMap.values()].filter((r) => r.data.assigneeId === member.id);
		const reports = records.filter((r) => r.kind === "daily" && r.owner_id === member.id && inRange(r.date, from, to) && REPORT_STATES.includes(r.status));
		const cuboidLines = reports.flatMap((r) => r.data.lines || []).filter((l) => l.activity !== "qc" && projectMap.get(taskMap.get(l.taskId)?.project_id || "")?.data.unit === "cuboid");
		const pendingKeyframeReports = reports.filter((r) => (r.data.lines || []).some((l) => l.activity !== "qc" && l.productionPending)).length;
		const quantity = sum(cuboidLines.map((l) => n(l.quantity))) + sum(reports.map((r) => reportedQc(r)?.kpiCuboids || 0)), missingQuantityLines = cuboidLines.filter((l) => !numeric(l.quantity)).length;
		const kpiApplicable = member.role !== "Lead" || jobs.some((t) => projectMap.get(t.project_id || "")?.data.unit === "cuboid") || records.some((r) => r.kind === "kpi-rate" && r.owner_id === member.id && r.status === "active" && r.date <= to);
		const targets = days.map((day) => kpiApplicable ? kpiDayTarget(day, member.id, records) : 0), target = sum(targets), kpiDays = targets.filter((t) => t > 0).length;
		const complete = jobs.filter((t) => t.status === "done" && inRange(dayOf$1(t.data.completedAt), from, to));
		const reviewDate = (r) => dayOf$1(r.data.checkedAt) || r.date;
		const reviews = records.filter((r) => r.kind === "review" && (r.data.fixerId || taskMap.get(r.task_id || "")?.data.assigneeId) === member.id && inRange(reviewDate(r), from, to));
		const returns = reviews.filter((r) => r.status === "changes" || r.data.verdict === "changes");
		const manualReworks = records.filter((r) => r.kind === "manual-rework" && r.status === "active" && r.owner_id === member.id && inRange(r.date, from, to));
		const reworkDates = [...new Set([...reworkDays(returns), ...manualReworks.map((r) => r.date)])].sort();
		const first = reviews.filter((r) => r.data.first && projectMap.get(r.project_id || "")?.data.unit === "cuboid"), checked = sum(first.map((r) => n(r.data.checked))), passed = sum(first.map((r) => n(r.data.passed)));
		const attendance = records.filter((r) => r.kind === "attendance" && r.owner_id === member.id && inRange(r.date, from, to));
		const fullDays = attendance.filter((r) => ["present", "late"].includes(r.status)).length, halfDays = attendance.filter((r) => r.status === "half").length;
		const late = attendance.filter((r) => r.status === "late"), lateMinutes = sum(late.map((r) => n(r.data.lateMinutes))), missingLateMinutes = late.filter((r) => !numeric(r.data.lateMinutes) || r.data.lateMinutes <= 0).length;
		const lines = reports.flatMap((r) => r.data.lines || []), annotationMinutes = sum(lines.filter((l) => l.activity !== "qc").map((l) => n(l.minutes))), qcMinutes = sum(lines.filter((l) => l.activity === "qc").map((l) => n(l.minutes)));
		const undatedRework = sum(records.filter((r) => r.kind === "legacy").flatMap((r) => r.data.rows || []).filter((r) => r.memberId === member.id).map((r) => n(r.reworkTasks)));
		const missingCompletionDate = jobs.filter((t) => t.status === "done" && !dayOf$1(t.data.completedAt)).length, missingTimeLines = lines.filter((l) => !numeric(l.minutes)).length, missingReworkLines = cuboidLines.filter((l) => !numeric(l.rework)).length;
		const expectedDays = days.filter((day) => day >= trackingStart && scheduledWorkday(day, settings));
		const reportDays = new Set(reports.map((r) => r.date)), attendanceDays = new Set(attendance.map((r) => r.date));
		const missingReportDays = expectedDays.filter((d) => !reportDays.has(d)).length, missingAttendanceDays = expectedDays.filter((d) => !attendanceDays.has(d)).length;
		const notes = [
			pendingKeyframeReports ? `${pendingKeyframeReports} báo cáo chờ bảng đếm, chưa kết luận KPI` : "",
			!reviews.length ? "Chưa có log QC trong hệ thống ở kỳ này" : "",
			undatedRework ? `${undatedRework} ghi nhận rework chưa có ngày, chưa cộng vào kỳ` : "",
			missingLateMinutes ? `${missingLateMinutes} lượt trễ thiếu số phút` : "",
			missingCompletionDate ? `${missingCompletionDate} bài hoàn thành thiếu ngày` : "",
			missingTimeLines ? `${missingTimeLines} dòng thiếu thời gian` : "",
			missingReworkLines ? `${missingReworkLines} dòng thiếu khối lượng sửa lỗi` : "",
			missingQuantityLines ? `${missingQuantityLines} dòng thiếu sản lượng` : "",
			missingReportDays ? `${missingReportDays} ngày chưa có báo cáo (gồm hôm nay nếu chưa gửi)` : "",
			missingAttendanceDays ? `${missingAttendanceDays} ngày chưa có điểm danh` : ""
		].filter(Boolean);
		return {
			memberId: member.id,
			name: member.name,
			username: member.email.split("@")[0],
			role: member.role,
			state: member.state,
			quantity,
			target,
			kpiApplicable,
			kpiDays,
			pendingKeyframeReports,
			currentRate: kpiApplicable ? dailyRate(member.id, to, records) : null,
			remaining: Math.max(0, target - quantity),
			ratio: target && !pendingKeyframeReports ? quantity / target : null,
			kpiResult: pendingKeyframeReports ? "Chờ bảng đếm" : !kpiApplicable ? "Không áp dụng" : !target ? "Không tính KPI" : missingQuantityLines ? "Thiếu dữ liệu" : quantity >= target ? "Đạt" : "Chưa đạt",
			completedTasks: complete.length,
			completedTaskIds: new Set(complete.map((t) => String(t.data.code || t.id))).size,
			missingCompletionDate,
			reworkCount: reworkDates.length,
			reworkDates,
			manualReworkCount: manualReworks.length,
			returnLogs: returns.length,
			reworkedJobs: new Set(returns.map((r) => r.task_id)).size,
			reviewCount: reviews.length,
			firstPassChecked: checked,
			firstPassPassed: passed,
			firstPassRatio: checked ? passed / checked : null,
			qcPerformed: days.reduce((total, day) => {
				const actual = records.filter((r) => r.kind === "review" && r.owner_id === member.id && reviewDate(r) === day);
				return total + reportedQcStats(reports.find((r) => r.date === day), actual.map((r) => String(r.data.jobId || taskMap.get(r.task_id || "")?.data.jobId || r.task_id || r.id)), actual.length).rounds;
			}, 0),
			reworkQuantity: sum(cuboidLines.map((l) => n(l.rework))),
			missingReworkLines,
			undatedRework,
			missingQuantityLines,
			fullDays,
			halfDays,
			presenceEquivalent: fullDays + halfDays * .5,
			lateDays: late.length,
			lateMinutes,
			missingLateMinutes,
			absentDays: attendance.filter((r) => r.status === "absent").length,
			leaveDays: attendance.filter((r) => r.status === "leave").length,
			conductGood: attendance.filter((r) => r.data.conduct === "Đúng quy định").length,
			conductBad: attendance.filter((r) => r.data.conduct === "Chưa đúng quy định").length,
			conductUnknown: attendance.filter((r) => !["Đúng quy định", "Chưa đúng quy định"].includes(r.data.conduct)).length,
			defaultAttendanceDays: attendance.filter((r) => r.data.defaulted).length,
			defaultConductDays: attendance.filter((r) => r.data.conductDefault || r.data.defaulted).length,
			missingAttendanceDays,
			reportCount: reports.length,
			missingReportDays,
			draftCount: records.filter((r) => r.kind === "daily" && r.owner_id === member.id && r.status === "draft" && inRange(r.date, from, to)).length,
			annotationMinutes,
			qcMinutes,
			missingTimeLines,
			issueReports: reports.filter((r) => r.data.blockers || (r.data.lines || []).some((l) => l.issue)).length,
			notes,
			sources: {
				reports: reports.map((r) => ({
					id: r.id,
					date: r.date,
					status: r.status,
					quantity: dailyKpi(r, records).quantity,
					pending: dailyKpi(r, records).pending
				})).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
				completed: complete.map((t) => ({
					id: t.id,
					code: t.data.code,
					jobId: t.data.jobId || "",
					date: dayOf$1(t.data.completedAt)
				})),
				returns: returns.map((r) => {
					const t = taskMap.get(r.task_id || "");
					return {
						id: r.id,
						code: t?.data.code || "",
						jobId: t?.data.jobId || "",
						date: reviewDate(r),
						productionDate: r.data.productionDate,
						round: r.data.round,
						failed: r.data.failed,
						errors: (r.data.errors || []).length,
						fixed: (r.data.errors || []).filter((e) => e.fixed).length
					};
				}),
				manualReworks: manualReworks.map((r) => ({
					id: r.id,
					date: r.date,
					reason: r.data.reason,
					recordedBy: members.find((m) => m.id === r.data.recordedBy)?.name || "Lead",
					recordedAt: r.data.recordedAt
				})).sort((a, b) => b.date.localeCompare(a.date)),
				attendance: attendance.map((r) => ({
					id: r.id,
					date: r.date,
					status: r.status,
					lateMinutes: r.data.lateMinutes ?? null,
					conduct: r.data.conduct || "Chưa đánh giá",
					note: r.data.note || "",
					defaulted: !!r.data.defaulted,
					conductDefault: !!r.data.conductDefault
				})).sort((a, b) => (b.date || "").localeCompare(a.date || ""))
			}
		};
	});
}
function evaluationTotals(rows) {
	const quantity = sum(rows.map((r) => r.quantity)), target = sum(rows.map((r) => r.target)), pendingKeyframeReports = sum(rows.map((r) => r.pendingKeyframeReports));
	return {
		members: rows.length,
		quantity,
		target,
		pendingKeyframeReports,
		ratio: target && !pendingKeyframeReports ? quantity / target : null,
		completedTasks: sum(rows.map((r) => r.completedTasks)),
		reworkCount: sum(rows.map((r) => r.reworkCount)),
		lateDays: sum(rows.map((r) => r.lateDays)),
		lateMinutes: sum(rows.map((r) => r.lateMinutes)),
		missingLateMinutes: sum(rows.map((r) => r.missingLateMinutes)),
		absentDays: sum(rows.map((r) => r.absentDays)),
		leaveDays: sum(rows.map((r) => r.leaveDays)),
		halfDays: sum(rows.map((r) => r.halfDays)),
		conductBad: sum(rows.map((r) => r.conductBad)),
		undatedRework: sum(rows.map((r) => r.undatedRework))
	};
}
var percent = (formula, value) => ({
	formula,
	value,
	format: "percent"
});
function evaluationSheets(data) {
	const d = (s) => /* @__PURE__ */ new Date(s + "T00:00:00Z"), status = (s) => ({
		active: "Hoạt động",
		pending: "Chờ kích hoạt",
		invited: "Đã mời",
		disabled: "Vô hiệu hóa"
	})[s] || s;
	return [
		{
			name: "Danh gia tong hop",
			rows: [[
				"Nhân sự",
				"Tên đăng nhập",
				"Vai trò",
				"Cuboid đã làm",
				"KPI trong kỳ",
				"Hoàn thành KPI (%)",
				"Còn thiếu (cuboid)",
				"Task/Job hoàn thành",
				"Rework (ngày có lỗi)",
				"Đi trễ (lần)",
				"Phút trễ đã biết",
				"Trễ thiếu phút (lần)",
				"Vắng (ngày)",
				"Nghỉ phép (ngày)",
				"Nửa ngày (lần)",
				"Tác phong chưa đúng (ngày)",
				"Kết quả KPI",
				"Ghi chú dữ liệu",
				"Từ ngày",
				"Đến ngày"
			], ...data.rows.map((r, i) => [
				r.name,
				r.username,
				r.role,
				r.quantity,
				r.kpiApplicable ? r.target : null,
				r.ratio == null ? null : percent(`D${i + 2}/E${i + 2}`, r.ratio),
				r.kpiApplicable ? r.remaining : null,
				r.completedTasks,
				r.reworkCount,
				r.lateDays,
				r.lateMinutes,
				r.missingLateMinutes,
				r.absentDays,
				r.leaveDays,
				r.halfDays,
				r.conductBad,
				r.kpiResult,
				r.notes.join("; "),
				d(data.from),
				d(data.to)
			])]
		},
		{
			name: "Cong viec va QC",
			rows: [[
				"Nhân sự",
				"Vai trò",
				"Trạng thái tài khoản",
				"Ngày tính KPI",
				"KPI ngày cuối kỳ",
				"Task/Job hoàn thành",
				"Task ID có Job hoàn thành",
				"Bài hoàn thành thiếu ngày",
				"Lượt QC nhận được",
				"Rework (ngày có lỗi)",
				"Số Job từng bị trả sửa",
				"Cuboid kiểm lần đầu",
				"Cuboid đạt lần đầu",
				"Đạt lần đầu (%)",
				"Lượt QC đã thực hiện",
				"Khối lượng sửa (cuboid) đã biết",
				"Dòng thiếu khối lượng sửa",
				"Rework chưa có ngày",
				"Daily đã gửi / duyệt",
				"Ngày chưa có báo cáo",
				"Báo cáo nháp",
				"Annotation (phút) đã biết",
				"QC (phút) đã biết",
				"Dòng thiếu thời gian",
				"Báo cáo có vướng mắc"
			], ...data.rows.map((r, i) => [
				r.name,
				r.role,
				status(r.state),
				r.kpiDays,
				r.currentRate,
				r.completedTasks,
				r.completedTaskIds,
				r.missingCompletionDate,
				r.reviewCount,
				r.reworkCount,
				r.reworkedJobs,
				r.firstPassChecked,
				r.firstPassPassed,
				r.firstPassRatio == null ? null : percent(`M${i + 2}/L${i + 2}`, r.firstPassRatio),
				r.qcPerformed,
				r.reworkQuantity,
				r.missingReworkLines,
				r.undatedRework,
				r.reportCount,
				r.missingReportDays,
				r.draftCount,
				r.annotationMinutes,
				r.qcMinutes,
				r.missingTimeLines,
				r.issueReports
			])]
		},
		{
			name: "Chuyen can",
			rows: [[
				"Nhân sự",
				"Có mặt đủ ngày (gồm đi trễ)",
				"Nửa ngày (lần)",
				"Có mặt quy đổi (ngày)",
				"Đi trễ (lần)",
				"Phút trễ đã biết",
				"Lượt trễ thiếu phút",
				"Vắng (ngày)",
				"Nghỉ phép (ngày)",
				"Đúng tác phong (ngày)",
				"Chưa đúng tác phong (ngày)",
				"Tác phong chưa đánh giá (ngày)",
				"Điểm danh mặc định (ngày)",
				"Tác phong mặc định (ngày)",
				"Ngày chưa có điểm danh"
			], ...data.rows.map((r) => [
				r.name,
				r.fullDays,
				r.halfDays,
				r.presenceEquivalent,
				r.lateDays,
				r.lateMinutes,
				r.missingLateMinutes,
				r.absentDays,
				r.leaveDays,
				r.conductGood,
				r.conductBad,
				r.conductUnknown,
				r.defaultAttendanceDays,
				r.defaultConductDays,
				r.missingAttendanceDays
			])]
		},
		{
			name: "Cach tinh",
			rows: [
				["Chỉ số", "Cách tính / phạm vi"],
				["Kỳ đánh giá", `${data.from.split("-").reverse().join("/")} – ${data.to.split("-").reverse().join("/")} (UTC+7)`],
				...EVALUATION_RULES
			]
		}
	];
}
//#endregion
//#region lib/qc-jobs.ts
function qcJobSource(records, taskId, memberId, day) {
	const reports = records.filter((r) => r.kind === "daily" && r.owner_id === memberId && r.date < day && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status)).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
	for (const report of reports) {
		const line = (report.data.lines || []).find((l) => l.taskId === taskId && l.activity !== "qc");
		if (line && reportEndId(line)) return {
			report,
			line: {
				...line,
				endId: reportEndId(line)
			}
		};
	}
	return null;
}
function qcClearedThrough(records, taskId) {
	const reviews = records.filter((r) => r.kind === "review" && r.task_id === taskId && r.data.mode === "daily" && /^\d+$/.test(r.data.endId || ""));
	const nextErrors = new Set(reviews.flatMap((r) => (r.data.errors || []).filter((e) => e.originReviewId).map((e) => e.originReviewId + ":" + e.originErrorIndex)));
	const intervals = reviews.map((r) => ({
		start: BigInt(r.data.rangeStart || "1"),
		end: BigInt(r.data.endId)
	})).sort((a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
	let through = BigInt(0);
	for (const interval of intervals) {
		if (interval.start > through + BigInt(1)) break;
		if (interval.end > through) through = interval.end;
	}
	for (const r of reviews) for (const [index, error] of (r.data.errors || []).entries()) {
		if (error.verification === "passed" || nextErrors.has(r.id + ":" + index) || error.fixed && error.verification !== "failed") continue;
		const failed = /^\d+$/.test(error.objectId || "") ? BigInt(error.objectId) : BigInt(r.data.rangeStart || "1");
		if (failed <= through) through = failed > BigInt(0) ? failed - BigInt(1) : BigInt(0);
	}
	return through.toString();
}
function qcJobState(records, assignment, day) {
	const task = records.find((r) => r.kind === "task" && r.id === assignment.task_id), source = qcJobSource(records, assignment.task_id, assignment.data.assigneeId, day);
	const sessions = records.filter((r) => r.kind === "qc-session" && r.task_id === assignment.task_id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
	const active = sessions.find((r) => r.status === "in_progress"), last = sessions.find((r) => r.id === assignment.data.lastSessionId && r.status === "completed") || sessions.find((r) => r.status === "completed") || sessions[0], through = qcClearedThrough(records, assignment.task_id), endId = source?.line.endId || "", pending = pendingQcErrors(records, assignment.task_id);
	let rangeStart = BigInt(through) > BigInt(0) ? through : endId === "0" ? "0" : "1";
	if (endId && BigInt(rangeStart) > BigInt(endId)) rangeStart = endId === "0" ? "0" : "1";
	const canStart = !!source && !active && (BigInt(endId) > BigInt(through) || pending.length > 0 || source.report.status !== "approved");
	return {
		task,
		source,
		active,
		last,
		through,
		rangeStart,
		endId,
		pending,
		canStart
	};
}
//#endregion
//#region lib/report-qc.ts
function reportQcKey(report) {
	const lines = (report.data.lines || []).filter((l) => l.activity !== "qc").map((l) => ({
		taskId: l.taskId,
		endId: reportEndId(l),
		quantity: l.quantity ?? null
	})).sort((a, b) => a.taskId.localeCompare(b.taskId));
	return JSON.stringify({
		owner: report.owner_id,
		date: report.date,
		token: report.data.qcContentToken || null,
		lines
	});
}
function sameVersion(review, report) {
	return review.data.sourceQcKey ? review.data.sourceQcKey === reportQcKey(report) : review.data.sourceReportRevision === (report.data.qcBaseRevision ?? report.revision);
}
function coversSource(review, report, records) {
	const session = records.find((r) => r.kind === "qc-session" && r.id === review.data.sessionId);
	return [review.data, ...review.data.coveredReports || session?.data.coveredReports || []].some((data) => data.sourceReportId === report.id && sameVersion({
		...review,
		data
	}, report));
}
function covers(intervals, start, end) {
	let next = start;
	for (const part of intervals.sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : 0)) {
		if (part.to < next) continue;
		if (part.from > next) return false;
		next = part.to + BigInt(1);
		if (next > end) return true;
	}
	return false;
}
function dailyQcApproved(report, records) {
	const lines = (report.data.lines || []).filter((l) => l.activity !== "qc");
	if (!lines.length) return false;
	const reviews = records.filter((r) => r.kind === "review" && r.data.mode === "daily"), byId = new Map(reviews.map((r) => [r.id, r]));
	function origin(review, index) {
		let row = review, n = index;
		const seen = /* @__PURE__ */ new Set();
		while (row.data.errors?.[n]?.originReviewId) {
			const error = row.data.errors[n], key = row.id + ":" + n;
			if (seen.has(key)) return null;
			seen.add(key);
			const previous = byId.get(error.originReviewId);
			if (!previous || previous.task_id !== review.task_id) return null;
			row = previous;
			n = error.originErrorIndex;
		}
		return {
			row,
			index: n
		};
	}
	const successors = new Set(reviews.flatMap((r) => (r.data.errors || []).filter((e) => e.originReviewId).map((e) => e.originReviewId + ":" + e.originErrorIndex)));
	return lines.every((line) => {
		const end = reportEndId(line);
		if (!end) return false;
		const last = BigInt(end);
		const prior = records.filter((r) => r.kind === "daily" && r.owner_id === report.owner_id && r.date < report.date && [
			"submitted",
			"approved",
			"imported"
		].includes(r.status)).sort((a, b) => b.date.localeCompare(a.date)).flatMap((r) => (r.data.lines || []).filter((l) => l.taskId === line.taskId && l.activity !== "qc" && reportEndId(l)).map((l) => reportEndId(l)))[0];
		const first = prior && BigInt(prior) < last ? BigInt(prior) + BigInt(1) : last === BigInt(0) ? BigInt(0) : BigInt(1);
		if (!covers(reviews.filter((r) => r.task_id === line.taskId && r.data.fixerId === report.owner_id && coversSource(r, report, records)).flatMap((r) => /^\d+$/.test(r.data.endId || "") && (!r.data.rangeStart || /^\d+$/.test(r.data.rangeStart)) ? [{
			from: r.data.rangeStart ? BigInt(r.data.rangeStart) : BigInt(r.data.endId) === BigInt(0) ? BigInt(0) : BigInt(1),
			to: BigInt(r.data.endId)
		}] : []), first, last)) return false;
		return !reviews.some((r) => r.task_id === line.taskId && (r.data.errors || []).some((e, index) => {
			const source = origin(r, index), root = source?.row;
			if (!root || root.data.fixerId !== report.owner_id || !coversSource(root, report, records)) return false;
			const objectId = root.data.errors?.[source.index]?.objectId || e.objectId;
			if (/^\d+$/.test(objectId || "") && (BigInt(objectId) < first || BigInt(objectId) > last)) return false;
			if (e.verification === "passed") return false;
			if (e.verification === "failed") return !successors.has(r.id + ":" + index);
			return !e.fixed;
		}));
	});
}
function reportQcApprovalStatements(hub, actor, records, overrides = []) {
	const changed = new Map(overrides.map((r) => [r.id, r])), prospective = [...records.map((r) => changed.get(r.id) || r), ...overrides.filter((r) => !records.some((v) => v.id === r.id))], statements = [];
	for (const report of records.filter((r) => r.kind === "daily" && [
		"submitted",
		"imported",
		"approved"
	].includes(r.status))) {
		if (report.status === "approved" && !report.data.autoQcApproved) continue;
		const approved = dailyQcApproved(report, prospective);
		if (approved === (report.status === "approved")) continue;
		const status = approved ? "approved" : report.data.qcPendingStatus || "submitted", data = {
			...report.data,
			qcBaseRevision: report.data.qcBaseRevision ?? report.revision,
			autoQcApproved: approved,
			qcPendingStatus: report.data.qcPendingStatus || (report.status === "approved" ? "submitted" : report.status),
			qcApprovalUpdatedAt: hub.stamp(),
			...approved ? {
				reviewedAt: hub.stamp(),
				reviewedBy: actor.id
			} : {}
		};
		statements.push(hub.replace(report, data, status), hub.audit(actor.id, approved ? "Tự duyệt báo cáo sau QC / sửa lỗi" : "Bỏ duyệt báo cáo do còn lỗi QC", report.id, report, {
			data,
			status
		}));
	}
	return statements;
}
//#endregion
//#region lib/task-frames.ts
function taskFrameCount(task) {
	if (!task) return null;
	const value = Object.hasOwn(task.data, "frameCount") ? task.data.frameCount : task.data.sourceFrames;
	return Number.isSafeInteger(value) && value > 0 && value <= 1e8 ? value : null;
}
//#endregion
//#region lib/qc-basic.ts
var BASIC_CHECKS = [
	{
		key: "scale",
		code: "S",
		name: "Scale không đồng bộ"
	},
	{
		key: "size",
		code: "K",
		name: "Kích thước"
	},
	{
		key: "z",
		code: "Z",
		name: "Cao độ Z"
	},
	{
		key: "rot",
		code: "H",
		name: "Hướng xoay"
	},
	{
		key: "overlap",
		code: "O",
		name: "Chồng lấn"
	},
	{
		key: "dist",
		code: "D",
		name: "Khoảng cách"
	},
	{
		key: "data",
		code: "!",
		name: "Cấu trúc dữ liệu"
	}
];
function basicQcState(records, assignment) {
	const runs = records.filter((r) => r.kind === "qc-basic" && r.task_id === assignment.task_id && r.owner_id === assignment.data.assigneeId).sort((a, b) => b.created_at.localeCompare(a.created_at));
	const latest = runs.find((r) => r.id === assignment.data.basicRunId) || runs[0], done = runs.find((r) => r.status === "completed");
	const legacy = !runs.length && records.some((r) => r.kind === "qc-session" && r.task_id === assignment.task_id && r.data.assigneeId === assignment.data.assigneeId && ["in_progress", "completed"].includes(r.status));
	return {
		runs,
		latest,
		done,
		legacy,
		canDetail: !!done || legacy
	};
}
//#endregion
//#region lib/qc-job-workflow.ts
var id$4 = stringType().min(1).max(200), frames$1 = coerce.number().int().positive().max(1e8).nullable().optional();
async function ensureQcAssignments(hub) {
	const rows = await hub.rows(), tasks = rows.filter((r) => r.kind === "task"), statements = [];
	for (const task of tasks) {
		if (rows.some((r) => r.kind === "qc-assignment" && r.task_id === task.id)) continue;
		const sessions = rows.filter((r) => r.kind === "qc-session" && r.task_id === task.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), last = sessions.find((r) => r.status === "in_progress") || sessions[0];
		if (!last) continue;
		const data = {
			reviewerId: last.data.reviewerId,
			assigneeId: task.data.assigneeId,
			assignedBy: last.data.assignedBy,
			assignedAt: last.data.assignedAt,
			note: last.data.assignmentNote || "",
			lastSessionId: last.id,
			migrated: true
		}, stamp = hub.stamp();
		statements.push(hub.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,'qc-assignment',?,?,?,?,?,'active',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind("qc-job-" + task.id, "qc-job:" + task.id, task.data.assigneeId, task.project_id, task.id, last.date, JSON.stringify(data), stamp, stamp));
	}
	if (statements.length) {
		const count = (await hub.db.batch(statements)).reduce((n, r) => n + (r.meta?.changes || 0), 0);
		if (count) await hub.db.batch([hub.audit("system:qc-jobs", "Gộp phân công QC theo Job", "qc-jobs", null, { jobs: count })]);
	}
}
async function qcJobAction(hub, m, action, b) {
	if (action === "qc-job-assign") {
		hub.lead(m);
		const data = objectType({
			taskId: id$4,
			reviewerId: id$4,
			frameCount: frames$1,
			note: stringType().max(1e4).default("")
		}).parse(b), task = await hub.get(data.taskId, "task"), members = await hub.members(), rows = await hub.rows();
		ensure(members.some((v) => v.id === data.reviewerId && v.state === "active" && ["Lead", "QA/QC"].includes(v.role)), "Chọn Lead hoặc QA/QC đang hoạt động");
		const old = rows.find((r) => r.kind === "qc-assignment" && r.task_id === task.id);
		ensure(!old || old.data.reviewerId === data.reviewerId || !rows.some((r) => r.kind === "qc-session" && r.task_id === task.id && r.status === "in_progress"), "Hoàn tất phiên QC đang mở trước khi đổi người kiểm tra", 409);
		return hub.commit(m, "Giao / cập nhật người QC cho Job", old || null, "qc-assignment", {
			...old?.data,
			reviewerId: data.reviewerId,
			assigneeId: task.data.assigneeId,
			assignedBy: old?.data.assignedBy || m.id,
			assignedAt: old?.data.assignedAt || hub.stamp(),
			updatedBy: m.id,
			note: data.note
		}, {
			owner_id: task.data.assigneeId,
			project_id: task.project_id,
			task_id: task.id,
			date: today(hub.now),
			natural_key: "qc-job:" + task.id,
			status: "active"
		}, [hub.replace(task, {
			...task.data,
			reviewerId: data.reviewerId,
			...data.frameCount !== void 0 ? { frameCount: data.frameCount } : {}
		})]);
	}
	if (action === "qc-job-start") {
		const data = objectType({
			id: id$4,
			rangeStart: stringType().regex(/^\d*$/).max(30).optional()
		}).parse(b), assignment = await hub.get(data.id, "qc-assignment");
		ensure(m.role === "Lead" || m.role === "QA/QC" && assignment.data.reviewerId === m.id, "Chỉ người QA/QC được giao hoặc Lead được xử lý", 403);
		const rows = await hub.rows(), state = qcJobState(rows, assignment, today(hub.now));
		if (state.active) return {
			ok: true,
			id: state.active.id
		};
		ensure(state.task && state.task.data.assigneeId === assignment.data.assigneeId, "Người làm Job đã đổi; Lead cần cập nhật phân công", 409);
		ensure(state.source, "Chưa có Daily Report của ngày trước để QC");
		ensure(state.canStart, "Chưa có ID mới hoặc lỗi cần kiểm lại cho Job này", 409);
		ensure(basicQcState(rows, assignment).canDetail, "Hoàn tất kiểm tra cơ bản bằng Tool_QC một lần trước khi QC chi tiết", 409);
		const { report, line } = state.source, endId = line.endId, rangeStart = data.rangeStart || state.rangeStart;
		ensure(/^\d+$/.test(rangeStart) && BigInt(rangeStart) <= BigInt(endId), "ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
		const sessionId = crypto.randomUUID(), task = state.task, pending = state.pending;
		const coveredReports = rows.filter((r) => r.kind === "daily" && r.owner_id === assignment.data.assigneeId && r.date <= report.date && [
			"submitted",
			"approved",
			"imported"
		].includes(r.status) && (r.data.lines || []).some((l) => l.taskId === task.id && l.activity !== "qc" && reportEndId(l))).map((r) => ({
			sourceReportId: r.id,
			sourceReportRevision: r.revision,
			sourceQcKey: reportQcKey(r),
			productionDate: r.date
		}));
		const value = {
			assignmentId: assignment.id,
			reviewerId: assignment.data.reviewerId,
			assigneeId: assignment.data.assigneeId,
			assignedBy: assignment.data.assignedBy,
			assignedAt: assignment.data.assignedAt,
			assignmentNote: assignment.data.note || "",
			sourceReportId: report.id,
			sourceReportRevision: report.revision,
			sourceQcKey: reportQcKey(report),
			coveredReports,
			productionDate: report.date,
			taskCode: task.data.code,
			jobId: task.data.jobId || "",
			reportedEndId: endId,
			endId,
			rangeStart,
			previousEndId: state.through,
			quantity: line.quantity ?? null,
			frameCount: taskFrameCount(task),
			startedAt: hub.stamp(),
			startedBy: m.id,
			pendingErrorKeys: pending.map((e) => e.key)
		};
		await hub.commit(m, "Bắt đầu lượt QC trong phân công Job", assignment, "qc-assignment", {
			...assignment.data,
			lastSessionId: sessionId
		}, {}, [
			hub.insert("qc-session", sessionId, value, {
				owner_id: assignment.data.assigneeId,
				task_id: task.id,
				project_id: task.project_id,
				date: today(hub.now),
				natural_key: assignment.id + ":" + sessionId,
				status: "in_progress"
			}),
			hub.replace(task, task.data),
			...rows.filter((r) => r.kind === "qc-session" && r.task_id === task.id && r.status === "assigned").map((r) => hub.replace(r, {
				...r.data,
				supersededBy: sessionId
			}, "superseded"))
		]);
		return {
			ok: true,
			id: sessionId
		};
	}
	return null;
}
//#endregion
//#region lib/qc-table.ts
var MAX_QC_IDS = 2e3;
var MAX_QC_LOGS = 2e3;
function qcIdKey(value) {
	return /^\d+$/.test(value) ? BigInt(value).toString() : value;
}
function qcIdRange(start, end) {
	if (!/^\d{1,30}$/.test(end) || start && !/^\d{1,30}$/.test(start)) throw new Error("Phạm vi ID không hợp lệ");
	const last = BigInt(end), first = start ? BigInt(start) : last === BigInt(0) ? BigInt(0) : BigInt(1), count = last - first + BigInt(1);
	if (count <= BigInt(0)) throw new Error("ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
	if (count > BigInt(2e3)) throw new Error(`Bảng QC tối đa ${MAX_QC_IDS} ID; chọn ID bắt đầu gần hơn trước khi bắt đầu QC`);
	return Array.from({ length: Number(count) }, (_, i) => (first + BigInt(i)).toString());
}
function qcIdRows(start, end, errorType, saved = []) {
	const byId = new Map(saved.map((row) => [qcIdKey(row.objectId), row]));
	return qcIdRange(start, end).map((objectId) => byId.get(objectId) || {
		objectId,
		result: "",
		frameId: "",
		type: errorType || "Khác",
		severity: "minor",
		description: "",
		evidence: ""
	});
}
function qcLogRows(data) {
	const rows = /* @__PURE__ */ new Map();
	for (const check of data.idChecks || []) rows.set(qcIdKey(check.objectId), {
		objectId: check.objectId,
		check,
		errors: []
	});
	for (const [index, error] of (data.errors || []).entries()) {
		const key = qcIdKey(error.objectId || ""), row = rows.get(key) || {
			objectId: error.objectId || "",
			errors: []
		};
		row.errors.push({
			index,
			error
		});
		rows.set(key, row);
	}
	return [...rows.values()].sort((a, b) => {
		const x = qcIdKey(a.objectId), y = qcIdKey(b.objectId);
		return /^\d+$/.test(x) && /^\d+$/.test(y) ? BigInt(x) < BigInt(y) ? -1 : BigInt(x) > BigInt(y) ? 1 : 0 : x.localeCompare(y);
	});
}
//#endregion
//#region lib/qc-workflow.ts
var id$3 = stringType().min(1).max(200), text = stringType().max(1e4), objectId$1 = stringType().max(30).regex(/^\d*$/, "ID chỉ gồm chữ số"), day = stringType().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Ngày không hợp lệ");
var code = enumType([
	"S",
	"K",
	"Z",
	"H",
	"O",
	"D",
	"L"
]);
var newError = objectType({
	type: stringType().min(1).max(200),
	severity: enumType([
		"minor",
		"major",
		"critical"
	]),
	description: text.min(1),
	objectId: objectId$1.default(""),
	frameId: objectId$1.default(""),
	frameEnd: objectId$1.default(""),
	code: code.optional(),
	evidence: stringType().max(2048).refine((v) => !v || /^https?:\/\//i.test(v), "Link minh chứng không hợp lệ").default("")
});
var frameLog = objectType({
	id: id$3,
	frameId: objectId$1.default(""),
	frameEnd: objectId$1.default(""),
	code: code.default("L"),
	type: stringType().min(1).max(200),
	severity: newError.shape.severity,
	description: text.trim(),
	evidence: newError.shape.evidence
});
var idCheck = objectType({
	objectId: objectId$1.min(1),
	result: enumType([
		"",
		"passed",
		"changes"
	]),
	frameId: objectId$1.default(""),
	type: stringType().max(200).default(""),
	severity: enumType([
		"minor",
		"major",
		"critical"
	]).default("minor"),
	description: text.trim().default(""),
	evidence: newError.shape.evidence,
	frameLogs: arrayType(frameLog).max(MAX_QC_LOGS).optional()
});
var resultSchema = objectType({
	id: id$3,
	revision: numberType().int().positive().optional(),
	matrixRunId: id$3.optional(),
	note: text.default(""),
	idChecks: arrayType(idCheck).max(MAX_QC_IDS).optional(),
	errors: arrayType(newError).max(MAX_QC_LOGS).default([]),
	rechecks: arrayType(objectType({
		reviewId: id$3,
		errorIndex: numberType().int().min(0),
		result: enumType(["passed", "failed"]),
		note: text.default("")
	})).max(MAX_QC_LOGS).default([])
});
async function dailyQcAction(hub, m, action, b) {
	const canCheck = (r) => ensure(m.role === "Lead" || m.role === "QA/QC" && r.data.reviewerId === m.id, "Chỉ người QA/QC được giao hoặc Lead được xử lý", 403);
	if (action === "qc-assign") {
		hub.lead(m);
		const data = objectType({
			taskId: id$3,
			sourceReportId: id$3,
			reviewerId: id$3,
			frameCount: coerce.number().int().positive().max(1e8).nullable().optional(),
			date: day.default(today(hub.now)),
			note: text.default("")
		}).parse(b);
		const task = await hub.get(data.taskId, "task"), report = await hub.get(data.sourceReportId, "daily");
		ensure((await hub.members()).some((v) => v.id === data.reviewerId && v.state === "active" && ["Lead", "QA/QC"].includes(v.role)), "Chọn Lead hoặc QA/QC đang hoạt động");
		ensure(data.date >= today(hub.now) && report.date < data.date, "Ngày giao QC phải từ hôm nay và sau ngày sản lượng");
		const line = (report.data.lines || []).find((l) => l.taskId === task.id && l.activity !== "qc");
		ensure(line && report.owner_id === task.data.assigneeId && [
			"submitted",
			"approved",
			"imported"
		].includes(report.status), "Không có báo cáo annotation hợp lệ cho bài này");
		const key = data.date + ":" + task.id + ":" + report.id, old = (await hub.rows("qc-session")).find((r) => r.natural_key === key);
		ensure(!old || old.status === "assigned", "Phiên đã bắt đầu hoặc hoàn tất; giữ nguyên người và log", 409);
		return hub.commit(m, "Giao việc QA/QC theo ngày", old || null, "qc-session", {
			...old?.data,
			reviewerId: data.reviewerId,
			assigneeId: report.owner_id,
			sourceReportId: report.id,
			sourceReportRevision: report.revision,
			productionDate: report.date,
			taskCode: task.data.code,
			jobId: task.data.jobId || "",
			reportedEndId: reportEndId(line),
			quantity: line.quantity ?? null,
			frameCount: data.frameCount === void 0 ? taskFrameCount(task) : data.frameCount,
			assignedBy: m.id,
			assignedAt: hub.stamp(),
			assignmentNote: data.note
		}, {
			owner_id: report.owner_id,
			task_id: task.id,
			project_id: task.project_id,
			date: data.date,
			natural_key: key,
			status: "assigned"
		}, [hub.replace(task, {
			...task.data,
			reviewerId: data.reviewerId,
			...data.frameCount !== void 0 ? { frameCount: data.frameCount } : {}
		}), hub.notify(data.reviewerId, "Được giao QC", `Task ${task.data.code} · Job ${task.data.jobId || "—"} · sản lượng ${report.date}`, "qa")]);
	}
	if (action === "qc-start") {
		const data = objectType({
			id: id$3,
			endId: objectId$1.default(""),
			rangeStart: objectId$1.default(""),
			endIdNote: text.default("")
		}).parse(b), session = await hub.get(data.id, "qc-session");
		canCheck(session);
		ensure(session.date === today(hub.now), "Chỉ bắt đầu QC đúng ngày được giao");
		if (session.status === "in_progress") return {
			ok: true,
			id: session.id
		};
		ensure(session.status === "assigned", "Phiên QC đã hoàn tất", 409);
		const task = await hub.get(session.task_id, "task"), report = await hub.get(session.data.sourceReportId, "daily"), line = (report.data.lines || []).find((l) => l.taskId === task.id && l.activity !== "qc");
		ensure(report.owner_id === session.data.assigneeId && task.data.assigneeId === session.data.assigneeId && line && [
			"submitted",
			"approved",
			"imported"
		].includes(report.status), "Bài hoặc báo cáo nguồn đã thay đổi; Lead cần kiểm tra lại", 409);
		const reportedEndId = reportEndId(line), endId = objectId$1.parse(reportedEndId || data.endId);
		ensure(endId, "Báo cáo chưa có ID cuối; nhập ID đã xác minh trước khi bắt đầu");
		ensure(reportedEndId || data.endIdNote.trim(), "Cần ghi nguồn xác minh khi bổ sung ID cuối còn thiếu");
		ensure(!data.rangeStart || BigInt(data.rangeStart) <= BigInt(endId), "ID bắt đầu phải nhỏ hơn hoặc bằng ID cuối");
		const all = await hub.rows();
		ensure(!all.some((r) => r.kind === "qc-session" && r.task_id === task.id && r.id !== session.id && r.status === "in_progress"), "Bài đang có phiên QC khác; hoàn tất phiên đó trước", 409);
		const pending = pendingQcErrors(all, task.id), previous = all.filter((r) => r.kind === "qc-session" && r.task_id === task.id && r.status === "completed").sort((a, b) => (b.data.completedAt || "").localeCompare(a.data.completedAt || ""))[0];
		return hub.commit(m, "Bắt đầu QA/QC", session, "qc-session", {
			...session.data,
			sourceReportRevision: report.revision,
			sourceQcKey: reportQcKey(report),
			reportedEndId: reportEndId(line),
			endId,
			rangeStart: data.rangeStart,
			previousEndId: previous?.data.endId || "",
			endIdNote: reportedEndId ? "" : data.endIdNote,
			quantity: line.quantity ?? null,
			frameCount: taskFrameCount(task),
			startedAt: hub.stamp(),
			startedBy: m.id,
			pendingErrorKeys: pending.map((e) => e.key)
		}, { status: "in_progress" }, [hub.replace(task, task.data)]);
	}
	if (action === "qc-result" || action === "qc-draft") {
		const data = resultSchema.parse(b);
		const session = await hub.get(data.id, "qc-session");
		canCheck(session);
		ensure(session.status === "in_progress", "Cần bắt đầu QC và chưa ghi kết quả cho phiên này", 409);
		if (data.revision !== void 0) ensure(data.revision === session.revision, "Nháp QC đã thay đổi ở nơi khác. Tải lại trước khi lưu để tránh ghi đè log.", 409);
		if (data.matrixRunId) {
			const run = await hub.get(data.matrixRunId, "qc-basic");
			ensure(run.task_id === session.task_id && run.owner_id === session.data.assigneeId && ["ready", "completed"].includes(run.status), "File ma trận không thuộc Job/người đang QC", 403);
			ensure(!session.data.matrixRunId || session.data.matrixRunId === data.matrixRunId, "Giữ file ma trận đã chọn cho phiên QC này", 409);
		}
		const task = await hub.get(session.task_id, "task");
		ensure(task.data.assigneeId === session.data.assigneeId, "Người được giao bài đã đổi; Lead cần kiểm tra lại", 409);
		if (data.idChecks) {
			let expected = [];
			try {
				expected = qcIdRange(session.data.rangeStart, session.data.endId);
			} catch (e) {
				ensure(false, e instanceof Error ? e.message : "Phạm vi ID không hợp lệ");
			}
			const ids = new Set(data.idChecks.map((c) => qcIdKey(c.objectId)));
			ensure(ids.size === data.idChecks.length, "Mỗi Object ID chỉ được có một dòng trong bảng QC");
			ensure(expected.length === data.idChecks.length && expected.every((id) => ids.has(id)), "Bảng QC phải có đủ từng ID trong phạm vi đã chốt");
			ensure(!data.errors.length, "Ghi lỗi trực tiếp vào từng dòng ID trong bảng QC");
			const logs = data.idChecks.flatMap((c) => c.frameLogs || []);
			ensure(logs.length <= MAX_QC_LOGS, `Mỗi phiên tối đa ${MAX_QC_LOGS} log`);
			ensure(new Set(logs.map((l) => l.id)).size === logs.length, "Mỗi log ma trận cần một mã riêng");
			for (const c of data.idChecks) if (c.frameLogs) {
				ensure(c.result === "changes" || !c.frameLogs.length, "ID có log lỗi không được đánh dấu Đạt");
				for (const log of c.frameLogs) {
					ensure(log.frameId || !log.frameEnd, "Cần frame bắt đầu của log");
					if (log.frameId) {
						const last = log.frameEnd || log.frameId;
						ensure(BigInt(last) >= BigInt(log.frameId) && BigInt(last) - BigInt(log.frameId) < BigInt(2e3), "Phạm vi một log phải từ 1 đến 2.000 frame");
					}
				}
			}
			if (action === "qc-result") {
				ensure(data.idChecks.every((c) => c.result), "Còn ID chưa kiểm; chọn Đạt hoặc Có lỗi cho từng ID trước khi hoàn tất");
				ensure(data.idChecks.every((c) => c.result !== "changes" || (c.frameLogs ? c.frameLogs.length > 0 && c.frameLogs.every((l) => l.description.trim()) : c.description.trim())), "ID có lỗi phải ghi nội dung log lỗi");
			}
			data.errors = data.idChecks.filter((c) => c.result === "changes").flatMap((c) => c.frameLogs ? c.frameLogs.map((l) => ({
				type: l.type,
				severity: l.severity,
				description: l.description,
				objectId: c.objectId,
				frameId: l.frameId,
				frameEnd: l.frameEnd,
				code: l.code,
				evidence: l.evidence
			})) : [{
				type: c.type,
				severity: c.severity,
				description: c.description,
				objectId: c.objectId,
				frameId: c.frameId,
				frameEnd: "",
				evidence: c.evidence
			}]);
		}
		if (action === "qc-draft") {
			ensure(data.idChecks, "Cần có bảng kiểm ID để lưu nháp");
			return hub.commit(m, "Lưu nháp bảng QC từng ID", session, "qc-session", {
				...session.data,
				...data.matrixRunId ? { matrixRunId: data.matrixRunId } : {},
				draft: {
					idChecks: data.idChecks,
					note: data.note,
					rechecks: data.rechecks,
					updatedAt: hub.stamp(),
					updatedBy: m.id
				}
			});
		}
		const settings = await hub.settings();
		ensure(data.errors.every((e) => settings.errorTypes.includes(e.type)), "Loại lỗi không nằm trong danh mục");
		ensure(data.errors.every((e) => !e.frameEnd || !!e.frameId && BigInt(e.frameEnd) >= BigInt(e.frameId) && BigInt(e.frameEnd) - BigInt(e.frameId) < BigInt(2e3)), "Phạm vi frame của log không hợp lệ");
		ensure(data.errors.every((e) => !e.objectId || BigInt(e.objectId) <= BigInt(session.data.endId) && (!session.data.rangeStart || BigInt(e.objectId) >= BigInt(session.data.rangeStart))), "Object ID mới phải nằm trong phạm vi ID đã chốt");
		const all = await hub.rows(), reviews = all.filter((r) => r.kind === "review" && r.task_id === task.id), changed = /* @__PURE__ */ new Map(), keys = /* @__PURE__ */ new Set(), repeated = [];
		for (const check of data.rechecks) {
			const key = check.reviewId + ":" + check.errorIndex;
			ensure(!keys.has(key), "Không kiểm trùng cùng một lỗi");
			keys.add(key);
			ensure(session.data.pendingErrorKeys.includes(key), "Lỗi không thuộc phạm vi kiểm lại của phiên này", 409);
			const previous = reviews.find((r) => r.id === check.reviewId), error = previous?.data.errors?.[check.errorIndex];
			ensure(previous?.data.mode === "daily" && error && !error.verification, "Lỗi đã được kiểm lại hoặc không thuộc bài", 409);
			ensure(check.result !== "passed" || error.fixed, "Annotator chưa xác nhận sửa lỗi này", 409);
			const value = changed.get(previous.id) || {
				...previous.data,
				errors: previous.data.errors.map((e) => ({ ...e }))
			};
			value.errors[check.errorIndex] = {
				...error,
				verification: check.result,
				verifiedBy: m.id,
				verifiedAt: hub.stamp(),
				verificationNote: check.note,
				verifiedInSession: session.id
			};
			changed.set(previous.id, value);
			if (check.result === "failed") repeated.push({
				type: error.type,
				severity: error.severity,
				description: error.description,
				objectId: error.objectId || "",
				frameId: error.frameId || "",
				frameEnd: error.frameEnd || "",
				...error.code ? { code: error.code } : {},
				evidence: error.evidence || "",
				originReviewId: previous.id,
				originErrorIndex: check.errorIndex,
				repeated: true,
				verificationNote: check.note
			});
		}
		ensure(keys.size === session.data.pendingErrorKeys.length, "Cần ghi kết quả kiểm lại cho từng lỗi cũ trước khi hoàn tất");
		const errors = [...data.errors, ...repeated].map((e) => ({
			...e,
			fixed: false
		}));
		ensure(errors.length <= MAX_QC_LOGS, `Mỗi phiên tối đa ${MAX_QC_LOGS} lỗi mới và lỗi cũ vẫn sai`);
		const verdict = errors.length ? "changes" : "passed", reviewId = crypto.randomUUID();
		const reviewData = {
			mode: "daily",
			sessionId: session.id,
			matrixRunId: data.matrixRunId || session.data.matrixRunId || null,
			fixerId: session.data.assigneeId,
			productionDate: session.data.productionDate,
			sourceReportId: session.data.sourceReportId,
			sourceReportRevision: session.data.sourceReportRevision,
			sourceQcKey: session.data.sourceQcKey,
			coveredReports: session.data.coveredReports,
			frameCount: session.data.frameCount,
			taskCode: session.data.taskCode,
			jobId: session.data.jobId,
			rangeStart: session.data.rangeStart,
			endId: session.data.endId,
			startedAt: session.data.startedAt,
			checkedAt: hub.stamp(),
			round: reviews.length + 1,
			first: false,
			scope: "daily",
			checked: null,
			passed: null,
			failed: null,
			verdict,
			note: data.note,
			errors,
			rechecks: data.rechecks,
			repairStatus: errors.length ? "pending" : "none",
			...data.idChecks ? {
				idChecks: data.idChecks,
				idCheckedCount: data.idChecks.length,
				idPassedCount: data.idChecks.filter((c) => c.result === "passed").length,
				idFailedCount: data.idChecks.filter((c) => c.result === "changes").length
			} : {}
		};
		const statements = [
			hub.insert("review", reviewId, reviewData, {
				owner_id: m.id,
				task_id: task.id,
				project_id: task.project_id,
				date: today(hub.now),
				status: verdict
			}),
			hub.replace(task, task.data),
			hub.notify(session.data.assigneeId, errors.length ? "QC có lỗi cần sửa" : "Đã ghi kết quả QC", `Task ${session.data.taskCode} · tới ID ${session.data.endId} · ${errors.length} lỗi`, "qa")
		];
		for (const [reviewId, value] of changed) {
			const previous = reviews.find((r) => r.id === reviewId);
			statements.push(hub.replace(previous, value), hub.audit(m.id, "Kiểm lại lỗi cũ", reviewId, previous, { data: value }));
		}
		const reviewRow = {
			...session,
			id: reviewId,
			kind: "review",
			owner_id: m.id,
			date: today(hub.now),
			status: verdict,
			revision: 1,
			data: reviewData
		};
		statements.push(...reportQcApprovalStatements(hub, m, all, [reviewRow, ...[...changed].map(([id, data]) => ({
			...reviews.find((r) => r.id === id),
			data
		}))]));
		return hub.commit(m, "Hoàn tất QA/QC và ghi log", session, "qc-session", {
			...session.data,
			matrixRunId: data.matrixRunId || session.data.matrixRunId || null,
			draft: null,
			completedAt: hub.stamp(),
			completedBy: m.id,
			reviewId,
			errorCount: errors.length,
			newErrorCount: data.errors.length,
			repeatedErrorCount: repeated.length,
			recheckedCount: data.rechecks.length,
			...data.idChecks ? {
				idCheckedCount: data.idChecks.length,
				idPassedCount: reviewData.idPassedCount,
				idFailedCount: reviewData.idFailedCount
			} : {},
			note: data.note
		}, { status: "completed" }, statements);
	}
	return null;
}
//#endregion
//#region lib/daily-reports.ts
var DAILY_REPORT_DEADLINE = "17:00";
function dailyReportWritable(actor, ownerId, day, now = /* @__PURE__ */ new Date(), deadline = DAILY_REPORT_DEADLINE) {
	if (!actor) return false;
	if (actor.role === "Lead") return true;
	if (actor.id !== ownerId) return false;
	const date = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(now);
	const time = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Asia/Ho_Chi_Minh",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23"
	}).format(now);
	return day === date && time < deadline;
}
//#endregion
//#region lib/report-production.ts
var PRODUCTION_FACTOR = .85;
function cuboidsFromIds(ids, frames) {
	if (!Number.isSafeInteger(ids) || ids < 0 || ids > 1e8 || frames == null || !Number.isSafeInteger(frames) || frames <= 0 || frames > 1e8) return null;
	const hundredths = BigInt(ids) * BigInt(frames) * BigInt(85);
	return hundredths <= BigInt(1e10) ? Number(hundredths) / 100 : null;
}
//#endregion
//#region lib/keyframe-kpi.ts
var known = (value) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 1e8 ? Number(value) : null;
function keyframeRange(records, owner, task, day, endId, excludeId, offset = 1) {
	const end = known(endId);
	const previous = records.filter((r) => r.kind === "daily" && r.id !== excludeId && r.owner_id === owner && r.date < day && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status)).flatMap((report) => (report.data.lines || []).filter((l) => l.taskId === task && l.activity !== "qc").map((line) => ({
		reportId: report.id,
		date: report.date,
		end: known(reportEndId(line))
	}))).filter((r) => r.end !== null).sort((a, b) => b.end - a.end || b.date.localeCompare(a.date))[0], start = (previous?.end ?? (offset === 0 ? -1 : 0)) + 1;
	const incomplete = records.filter((r) => r.kind === "daily" && r.id !== excludeId && r.owner_id === owner && r.date < day && (!previous || r.date > previous.date) && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status) && (r.data.lines || []).some((line) => line.taskId === task && line.activity !== "qc" && !reportEndId(line) && Number(line.quantity) > 0)).sort((a, b) => b.date.localeCompare(a.date))[0];
	return {
		start,
		end,
		previousEnd: start - 1,
		previousReportId: previous?.reportId || null,
		previousDate: previous?.date || null,
		baselineUnknown: incomplete ? `Báo cáo ngày ${incomplete.date} thiếu mốc ID. Lead cần bổ sung mốc cũ để tránh cộng lại sản lượng.` : "",
		error: end === null ? "Nhập ID đã làm tới hợp lệ (tối đa 100.000.000)." : end < start - 1 ? "ID đã làm tới thấp hơn mốc đã báo cáo trước đó. Không tính lại ID cũ." : ""
	};
}
function keyframeQuantity(production, range) {
	const rows = range.end === null ? [] : production.ids.filter((r) => r.id >= range.start && r.id <= range.end);
	const total = (key) => rows.reduce((n, r) => n + r[key], 0);
	const maxId = Math.max(range.previousEnd, ...production.ids.map((r) => r.id));
	const error = range.error || range.baselineUnknown || (!production.usable ? "File chưa đủ dữ liệu keyframe/outside để chốt KPI." : range.end > maxId ? `File chỉ có Object ID tới ${maxId}; tải bản annotation mới hơn.` : "");
	const baseline = rows.reduce((n, r) => n + (r.baselineCount || 0), 0), added = rows.reduce((n, r) => n + (r.addedCount || 0), 0);
	return {
		...range,
		quantity: production.basis === "datumaro-baseline-v1" ? baseline + added : total("keyframes"),
		baseline,
		added,
		visible: total("visible"),
		outside: total("outside"),
		unknown: total("unknown"),
		countedIds: rows.length,
		error
	};
}
function keyframeComparisons(records, owner, task, production) {
	return records.filter((r) => r.kind === "daily" && r.owner_id === owner && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status) && (r.data.lines || []).some((l) => l.taskId === task && l.activity !== "qc")).sort((a, b) => b.date.localeCompare(a.date)).map((report) => {
		const line = report.data.lines.find((l) => l.taskId === task && l.activity !== "qc");
		const count = keyframeQuantity(production, keyframeRange(records, owner, task, report.date, reportEndId(line), report.id, production.offset)), saved = Number(line.quantity) || 0;
		return {
			reportId: report.id,
			date: report.date,
			endId: reportEndId(line),
			...count,
			savedQuantity: saved,
			difference: count.quantity - saved,
			method: line.productionMethod || "legacy",
			snapshot: line.keyframeSnapshot || null
		};
	});
}
//#endregion
//#region lib/datumaro-kpi.ts
var DATUMARO_METHOD = "datumaro-baseline-v1";
var countedMethod = (method) => method === "datumaro-baseline-v1" || method === "keyframe-v1";
function datumaroLedger(incoming, reference, old, reportedThrough = -1) {
	if (incoming.format !== "datumaro" || !incoming.datumaroUsable) throw new Error("Cần Datumaro hợp lệ, có track_id và frame. " + (incoming.countIssues || []).join(" "));
	if (old && (incoming.offset !== old.offset || JSON.stringify(incoming.scopeFrames) !== JSON.stringify(old.scopeFrames))) throw new Error("File khác offset hoặc phạm vi frame của file ban đầu. Chọn đúng bản xuất của cùng Job.");
	const before = new Map((old?.ids || []).map((r) => [r.id, r])), now = new Map(incoming.ids.map((r) => [r.id, r]));
	const maxBefore = Math.max(-1, ...before.keys());
	if (new Set([...before.keys(), ...now.keys()]).size > 5e3) throw new Error("Tối đa 5.000 Object ID trong bảng tích lũy của Job.");
	for (const row of incoming.ids) {
		if (!Number.isSafeInteger(row.cuboids) || row.cuboids < 0) throw new Error("File thiếu tổng cuboid theo ID; tải lại file để đếm.");
		if (old && !before.has(row.id) && row.id <= maxBefore) throw new Error(`ID ${row.id} mới xuất hiện trong khoảng ID cũ. Cần đối chiếu lại Object ID; chưa tự cộng vì có thể đã đánh lại số ID.`);
		if (before.has(row.id) && before.get(row.id).label !== row.label) throw new Error(`Class của ID ${row.id} khác file trước. Cần đối chiếu định danh trước khi dùng tính KPI.`);
	}
	const ids = [...new Set([...before.keys(), ...now.keys()])].sort((a, b) => a - b).map((id) => {
		const prev = before.get(id), cur = now.get(id), raw = cur || prev;
		const baselineCount = old ? prev?.baselineCount || 0 : cur.cuboids;
		const addedCount = old ? prev?.baselineCount ? 0 : prev && id <= reportedThrough ? prev.addedCount : Math.max(prev?.addedCount || 0, cur?.cuboids || 0) : 0;
		return {
			...raw,
			cuboids: cur?.cuboids || 0,
			credit: baselineCount + addedCount,
			baselineCount,
			addedCount,
			currentCount: cur?.cuboids || 0
		};
	});
	const sum = (key) => ids.reduce((n, r) => n + r[key], 0);
	if (sum("credit") > 1e8) throw new Error("Khối lượng vượt giới hạn 100.000.000 cuboid.");
	return {
		...incoming,
		usable: true,
		basis: DATUMARO_METHOD,
		scopeFrames: incoming.scopeFrames || [],
		ids,
		baseline: old?.baseline || {
			...reference,
			total: sum("baselineCount")
		},
		creditTotal: sum("credit"),
		baselineTotal: sum("baselineCount"),
		addedTotal: sum("addedCount"),
		currentTotal: sum("currentCount")
	};
}
function completedThrough(records, owner, task) {
	return Math.max(-1, ...records.filter((r) => r.kind === "daily" && r.owner_id === owner && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status)).flatMap((r) => (r.data.lines || []).filter((l) => l.taskId === task && l.activity !== "qc").map((l) => /^\d+$/.test(reportEndId(l)) ? Number(reportEndId(l)) : -1)));
}
function suggestDailyEnd(records, owner, task, day, production, otherQuantity = 0, reportId) {
	const target = kpiDayTarget(day, owner, records), needed = Math.max(0, target - otherQuantity);
	const range = keyframeRange(records, owner, task, day, "", reportId, production?.offset);
	const base = {
		target,
		needed,
		previousEnd: range.previousEnd,
		start: range.start
	};
	if (!target) return {
		...base,
		status: "excluded",
		endId: null,
		quantity: 0,
		shortfall: 0,
		error: "Ngày này không tính KPI."
	};
	if (!needed) return {
		...base,
		status: "met",
		endId: null,
		quantity: 0,
		shortfall: 0,
		error: "Các bài khác đã đủ KPI ngày."
	};
	const error = range.baselineUnknown || (!production?.usable ? "Chờ bảng cuboid theo ID đã xác nhận để gợi ý mốc KPI." : "");
	if (error) return {
		...base,
		status: "pending",
		endId: null,
		quantity: 0,
		shortfall: needed,
		error
	};
	const ids = production.ids.filter((r) => r.id >= range.start).sort((a, b) => a.id - b.id);
	let quantity = 0;
	for (const row of ids) {
		quantity += production.basis === "datumaro-baseline-v1" ? row.credit || 0 : row.keyframes;
		if (quantity >= needed) return {
			...base,
			status: "ready",
			endId: row.id,
			quantity,
			shortfall: 0,
			error: ""
		};
	}
	return {
		...base,
		status: "insufficient",
		endId: ids.at(-1)?.id ?? null,
		quantity,
		shortfall: Math.max(0, needed - quantity),
		error: "Bảng đếm chưa đủ khối lượng để đạt KPI; cần bổ sung file hoặc bài được giao."
	};
}
//#endregion
//#region lib/weekly-snapshot.ts
function weeklySnapshot(records, memberId, start, cutoff) {
	return records.find((r) => r.kind === "weekly-snapshot" && r.owner_id === memberId && r.date === start && r.status === "approved" && r.data.asOf <= cutoff);
}
//#endregion
//#region lib/weekly-summary.ts
var add = (s, n) => {
	const d = /* @__PURE__ */ new Date(s + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
};
function weeklyStart(s) {
	return add(s, -(((/* @__PURE__ */ new Date(s + "T12:00:00Z")).getUTCDay() + 6) % 7));
}
var dayOf = (r) => {
	const stamp = r.data.checkedAt || r.data.completedAt;
	return stamp && Number.isFinite(Date.parse(stamp)) ? new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Ho_Chi_Minh",
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).format(new Date(stamp)) : r.date || "";
};
var states = {
	present: "Có mặt",
	late: "Đi trễ",
	absent: "Vắng",
	leave: "Nghỉ phép",
	half: "Nghỉ nửa ngày"
};
var validReports = new Set([
	"submitted",
	"approved",
	"imported"
]);
function buildWeeklySummary(members, records, week, asOf, owner = "team") {
	const selected = new Set(members.filter((m) => owner === "team" || m.id === owner).map((m) => m.id));
	const start = weeklyStart(week), end = add(start, 6), cutoff = end < asOf ? end : asOf, config = records.find((r) => r.id === "settings")?.data || {}, days = Array.from({ length: 7 }, (_, i) => add(start, i)), tasks = new Map(records.filter((r) => r.kind === "task").map((r) => [r.id, r])), projects = new Map(records.filter((r) => r.kind === "project").map((r) => [r.id, r]));
	const workDays = days.filter((day, index) => index < 5 || index === 5 && scheduledWorkday(day, config) && !records.some((r) => r.kind === "kpi-exclusion" && r.status === "active" && !r.owner_id && r.date === day));
	const reviews = records.filter((r) => r.kind === "review" && dayOf(r) <= cutoff), firstIds = /* @__PURE__ */ new Map();
	for (const review of [...reviews].sort((a, b) => (a.data.checkedAt || a.date || a.created_at).localeCompare(b.data.checkedAt || b.date || b.created_at))) {
		const owner = review.data.fixerId || tasks.get(review.task_id || "")?.data.assigneeId;
		if (!owner) continue;
		for (const check of review.data.idChecks || []) {
			if (!["passed", "changes"].includes(check.result)) continue;
			const objectId = String(check.objectId).replace(/^0+(?=\d)/, ""), key = owner + ":" + review.task_id + ":" + objectId;
			if (!firstIds.has(key)) firstIds.set(key, {
				memberId: owner,
				taskId: review.task_id,
				objectId,
				day: dayOf(review),
				passed: check.result === "passed"
			});
		}
	}
	const qcEvents = /* @__PURE__ */ new Map();
	for (const review of reviews.filter((r) => dayOf(r) >= start)) {
		const t = tasks.get(review.task_id || "");
		qcEvents.set(review.id, {
			id: review.id,
			date: dayOf(review),
			taskId: review.task_id,
			taskCode: review.data.taskCode || t?.data.code || "",
			jobId: review.data.jobId || t?.data.jobId || "",
			reviewerId: review.owner_id,
			assigneeId: review.data.fixerId || t?.data.assigneeId,
			rangeStart: review.data.rangeStart || "",
			endId: review.data.endId || "",
			checkedIds: review.data.idCheckedCount ?? null,
			passedIds: review.data.idPassedCount ?? null,
			failedIds: review.data.idFailedCount ?? null,
			errorCount: (review.data.errors || []).length,
			verdict: review.data.verdict || review.status,
			note: review.data.note || ""
		});
	}
	for (const session of records.filter((r) => r.kind === "qc-session" && r.status === "completed" && dayOf(r) >= start && dayOf(r) <= cutoff && !qcEvents.has(r.data.reviewId))) {
		const t = tasks.get(session.task_id || "");
		qcEvents.set(session.id, {
			id: session.id,
			date: dayOf(session),
			taskId: session.task_id,
			taskCode: session.data.taskCode || t?.data.code || "",
			jobId: session.data.jobId || t?.data.jobId || "",
			reviewerId: session.data.completedBy || session.data.reviewerId,
			assigneeId: session.data.assigneeId,
			rangeStart: session.data.rangeStart || "",
			endId: session.data.endId || "",
			checkedIds: session.data.idCheckedCount ?? null,
			passedIds: session.data.idPassedCount ?? null,
			failedIds: session.data.idFailedCount ?? null,
			errorCount: session.data.errorCount ?? null,
			verdict: session.data.errorCount ? "changes" : "passed",
			note: session.data.note || ""
		});
	}
	const events = [...qcEvents.values()].filter((e) => selected.has(e.reviewerId) || selected.has(e.assigneeId)).sort((a, b) => a.date.localeCompare(b.date)), evaluations = buildTeamEvaluation(members, records, start, cutoff);
	const rows = members.filter((m) => selected.has(m.id)).map((member) => {
		const reports = records.filter((r) => r.kind === "daily" && r.owner_id === member.id && r.date >= start && r.date <= cutoff && validReports.has(r.status)), base = evaluations.find((r) => r.memberId === member.id), mine = events.filter((e) => e.reviewerId === member.id);
		const applicable = member.role !== "Lead" || reports.some((r) => (r.data.lines || []).some((l) => l.activity !== "qc" && projects.get(tasks.get(l.taskId)?.project_id || "")?.data.unit === "cuboid")) || records.some((r) => r.kind === "kpi-rate" && r.owner_id === member.id && r.status === "active" && r.date <= end);
		const daily = days.map((date) => {
			const report = reports.find((r) => r.date === date), lines = (report?.data.lines || []).filter((l) => l.activity !== "qc" && projects.get(tasks.get(l.taskId)?.project_id || "")?.data.unit === "cuboid"), future = date > cutoff, expected = !future && date >= (config.kpiStartDate || "2026-10-20") && scheduledWorkday(date, config), target = applicable ? kpiDayTarget(date, member.id, records) : 0, quantity = report ? dailyKpi(report, records).quantity : null, pending = lines.some((l) => l.productionPending), attendance = !future ? records.find((r) => r.kind === "attendance" && r.owner_id === member.id && r.date === date) : void 0, jobs = mine.filter((e) => e.date === date), qc = reportedQcStats(report, jobs.map((e) => String(e.jobId || e.taskId || e.id)), jobs.length);
			return {
				date,
				memberId: member.id,
				name: member.name,
				role: member.role,
				rate: applicable ? dailyRate(member.id, date, records) : null,
				target,
				quantity,
				hasReport: !!report,
				expected,
				future,
				pending,
				ratio: !future && !pending && target && quantity !== null ? quantity / target : null,
				result: future ? "Chưa đến ngày" : !applicable ? "Không áp dụng" : target === 0 ? "Không tính KPI" : pending ? "Chờ bảng đếm" : quantity === null ? "Chưa gửi" : quantity >= target ? "Đạt" : "Chưa đạt",
				jobs: [...new Set((report?.data.lines || []).map((l) => l.jobId || tasks.get(l.taskId)?.data.jobId).filter(Boolean))].join(", "),
				qcJobs: qc.jobs,
				qcRounds: qc.rounds,
				rework: base.reworkDates.includes(date) ? 1 : 0,
				attendance: attendance ? states[attendance.status] || attendance.status : future ? "Chưa đến ngày" : !scheduledWorkday(date, config) ? "Ngày nghỉ" : date < (config.kpiStartDate || "2026-10-20") ? "Chưa theo dõi" : "Chưa điểm danh",
				lateMinutes: attendance?.data.lateMinutes ?? null,
				conduct: attendance?.data.conduct || (!future && expected ? "Chưa đánh giá" : ""),
				attendanceDefault: !!attendance?.data.defaulted,
				conductDefault: !!(attendance?.data.conductDefault || attendance?.data.defaulted),
				offEquivalent: attendance ? attendance.status === "half" ? .5 : ["leave", "absent"].includes(attendance.status) ? 1 : 0 : null
			};
		});
		const quantity = daily.reduce((n, d) => n + (d.quantity || 0), 0), target = daily.reduce((n, d) => n + d.target, 0), pending = daily.some((d) => d.pending), missingReports = daily.filter((d) => d.expected && !d.hasReport).length, idChecks = [...firstIds.values()].filter((c) => c.memberId === member.id && c.day >= start && c.day <= cutoff), idPassed = idChecks.filter((c) => c.passed).length;
		const qualityId = idChecks.length ? idPassed / idChecks.length : null, qualityCuboid = base.firstPassChecked ? base.firstPassPassed / base.firstPassChecked : null, quality = qualityId ?? qualityCuboid, qualityBasis = qualityId !== null ? "ID đạt QC lần đầu" : qualityCuboid !== null ? "Cuboid đạt QC lần đầu" : "Chưa có số đã kiểm / số đạt";
		const notes = [
			...reports.filter((r) => r.data.manualProduction?.approximate).map((r) => `${r.date}: sản lượng ước lượng`),
			reports.some((r) => reportedQc(r)?.jobs === null) ? "Có khối lượng QC chưa ghi số bài / Job ID" : "",
			pending ? "Có báo cáo chờ bảng đếm" : "",
			missingReports ? `${missingReports} ngày chưa có Daily Report` : "",
			quality === null ? "Chưa có dữ liệu tính quality" : "",
			base.missingAttendanceDays ? `${base.missingAttendanceDays} ngày thiếu điểm danh` : ""
		].filter(Boolean);
		return {
			memberId: member.id,
			name: member.name,
			username: member.email.split("@")[0],
			role: member.role,
			state: member.state,
			applicable,
			currentRate: applicable ? dailyRate(member.id, cutoff, records) : null,
			quantity,
			target,
			targetToDate: daily.filter((d) => !d.future).reduce((n, d) => n + d.target, 0),
			ratio: target && !pending ? quantity / target : null,
			result: !applicable ? "Không áp dụng" : !target ? "Không tính KPI" : pending ? "Chờ bảng đếm" : quantity >= target ? "Đạt" : missingReports ? "Thiếu báo cáo" : "Chưa đạt",
			daily,
			daysMet: daily.filter((d) => d.result === "Đạt").length,
			kpiDays: daily.filter((d) => !d.future && d.target > 0).length,
			missingReports,
			qcJobs: new Set(mine.map((e) => e.jobId || e.taskId)).size,
			qcRounds: daily.reduce((n, d) => n + d.qcRounds, 0),
			reworkCount: base.reworkCount,
			reworkDates: base.reworkDates,
			completedTasks: base.completedTasks,
			offEquivalent: base.absentDays + base.leaveDays + base.halfDays * .5,
			halfDays: base.halfDays,
			leaveDays: base.leaveDays,
			absentDays: base.absentDays,
			lateDays: base.lateDays,
			lateMinutes: base.lateMinutes,
			conductGood: base.conductGood,
			conductBad: base.conductBad,
			conductUnknown: base.conductUnknown,
			quality,
			qualityBasis,
			qualityId,
			qualityIdChecked: idChecks.length,
			qualityIdPassed: idPassed,
			qualityCuboid,
			qualityCuboidChecked: base.firstPassChecked,
			qualityCuboidPassed: base.firstPassPassed,
			notes,
			reports: reports.map((r) => ({
				id: r.id,
				date: r.date
			})),
			issues: [...new Set(reports.flatMap((r) => [r.data.blockers, ...(r.data.lines || []).map((l) => l.issue)]).filter(Boolean))],
			nextPlan: [...reports].sort((a, b) => b.date.localeCompare(a.date)).find((r) => r.data.nextPlan)?.data.nextPlan || ""
		};
	}).map((row) => {
		const saved = weeklySnapshot(records, row.memberId, start, cutoff);
		if (!saved) return {
			...row,
			closedTotals: null,
			dailyUnallocated: false,
			daily: row.daily.map((day) => ({
				...day,
				dailyUnallocated: false
			}))
		};
		const totals = saved.data.totals, role = saved.data.role || row.role, applicable = role !== "Lead" || totals.quantity > 0 || totals.target > 0;
		return {
			...row,
			...totals,
			closedTotals: totals,
			role,
			applicable,
			currentRate: null,
			targetToDate: totals.target,
			ratio: totals.target ? totals.quantity / totals.target : null,
			result: !applicable ? "Không áp dụng" : !totals.target ? "Không tính KPI" : totals.quantity >= totals.target ? "Đạt" : "Chưa đạt",
			missingReports: 0,
			qualityId: null,
			qualityIdChecked: 0,
			qualityIdPassed: 0,
			qualityCuboid: null,
			qualityCuboidChecked: 0,
			qualityCuboidPassed: 0,
			dailyUnallocated: true,
			notes: ["Tổng tuần đã chốt; chưa có phân bổ theo ngày"],
			daily: row.daily.map((day) => ({
				...day,
				quantity: null,
				rate: null,
				target: null,
				ratio: null,
				qcJobs: null,
				qcRounds: null,
				rework: null,
				attendance: "Chỉ có tổng tuần",
				lateMinutes: null,
				conduct: "",
				offEquivalent: null,
				attendanceDefault: false,
				conductDefault: false,
				result: "Chỉ có tổng tuần",
				dailyUnallocated: true
			}))
		};
	});
	const closedOwners = new Set(rows.filter((r) => r.dailyUnallocated).map((r) => r.memberId));
	const totals = {
		quantity: rows.reduce((n, r) => n + r.quantity, 0),
		target: rows.reduce((n, r) => n + r.target, 0),
		qcRounds: rows.reduce((n, r) => n + r.qcRounds, 0),
		qcJobs: rows.reduce((n, r) => n + r.qcJobs, 0),
		reworkCount: rows.reduce((n, r) => n + r.reworkCount, 0),
		offEquivalent: rows.reduce((n, r) => n + r.offEquivalent, 0),
		qualityIdChecked: rows.reduce((n, r) => n + r.qualityIdChecked, 0),
		qualityIdPassed: rows.reduce((n, r) => n + r.qualityIdPassed, 0),
		missingReports: rows.reduce((n, r) => n + r.missingReports, 0)
	};
	return {
		start,
		end,
		asOf: cutoff,
		workDays,
		directory: members.map((m) => ({
			id: m.id,
			name: m.name
		})),
		rows,
		totals: {
			...totals,
			ratio: totals.target ? totals.quantity / totals.target : null,
			quality: totals.qualityIdChecked ? totals.qualityIdPassed / totals.qualityIdChecked : null
		},
		qcEvents: events,
		qcReported: records.filter((r) => r.kind === "daily" && selected.has(r.owner_id || "") && r.date >= start && r.date <= cutoff && validReports.has(r.status) && reportedQc(r)).map((r) => ({
			id: r.id,
			date: r.date,
			reviewerId: r.owner_id,
			...reportedQc(r),
			label: reportedQcLabel(r)
		})),
		work: records.filter((r) => r.kind === "daily" && selected.has(r.owner_id || "") && r.date >= start && r.date <= cutoff && validReports.has(r.status)).sort((a, b) => a.date.localeCompare(b.date)).flatMap((r) => (r.data.lines || []).map((l) => ({
			date: r.date,
			memberId: r.owner_id,
			name: members.find((m) => m.id === r.owner_id)?.name,
			taskCode: l.taskCode || tasks.get(l.taskId)?.data.code || "",
			jobId: l.jobId || tasks.get(l.taskId)?.data.jobId || "",
			endId: reportEndId(l),
			activity: l.activity === "qc" ? reportedQc(r)?.kpiCuboids ? "QC (tính KPI)" : "QC" : "Annotation",
			quantity: closedOwners.has(r.owner_id || "") ? null : l.activity === "qc" ? l === (r.data.lines || []).find((v) => v.activity === "qc") ? reportedQc(r)?.kpiCuboids || null : null : l.quantity ?? null,
			rework: l.rework ?? null,
			minutes: l.minutes ?? null,
			issue: closedOwners.has(r.owner_id || "") ? "Tổng tuần đã chốt; chưa có phân bổ cuboid theo ngày" : l.issue || "",
			nextPlan: r.data.nextPlan || ""
		}))),
		rules: [
			"Tuần hiện tại lấy sản lượng từ Daily Report đã gửi/duyệt; QC và sửa lỗi không tự cộng annotation mới; khối lượng được Lead xác nhận tính KPI giữ theo báo cáo. Tuần đã chốt theo tổng riêng thì không tự phân bổ số liệu về ngày.",
			"KPI từng ngày lấy mức riêng có hiệu lực của người đó, lịch thứ Bảy cách tuần và ngày miễn KPI. Không tự đổi KPI cũ theo role.",
			"Tiến độ theo ngày: annotator ghi cuboid; Lead/QA/QC ghi cuboid/bài QC, ví dụ 600/2. Bài QC mỗi ngày đếm Job khác nhau có kết quả; Lượt QC tuần đếm từng lượt ghi kết quả, không đếm phân công chưa thực hiện.",
			"Quality ID = ID đạt ngay lần kiểm đầu / ID có kết quả lần kiểm đầu, mỗi ID/Job chỉ tính một lần. Không trộn ID với cuboid; thiếu mẫu số để trống.",
			"Ngày nghỉ quy đổi = nghỉ phép cả ngày + vắng cả ngày + 0,5 × số lần nghỉ nửa ngày. Rework: mỗi người mỗi ngày có lỗi tính một lần."
		]
	};
}
var weeklyDayLabel = (day) => `T${(/* @__PURE__ */ new Date(day + "T12:00:00Z")).getUTCDay() + 1} ${day.slice(8, 10)}/${day.slice(5, 7)}`;
function weeklyDayProgress(row, day) {
	if (row.dailyUnallocated || day.future) return null;
	if (day.pending) return day.qcJobs ? `Chờ/${day.qcJobs}` : "Chờ bảng đếm";
	const quantity = day.quantity === null && row.role === "Lead" && !row.applicable ? 0 : day.quantity;
	if (["Lead", "QA/QC"].includes(row.role) || day.qcJobs) return quantity === null && !day.qcJobs ? null : `${quantity ?? "—"}/${day.qcJobs ?? "—"}`;
	return quantity;
}
function weeklyKpiGoal(row, workDays) {
	if (!row.applicable || row.dailyUnallocated) return null;
	const days = row.daily.filter((d) => workDays.includes(d.date) && d.rate !== null);
	if (!days.length) return null;
	const goal = (rate) => row.role === "QA/QC" ? `${rate}/2` : rate;
	if (days.every((d) => d.rate === days[0].rate)) return goal(days[0].rate);
	const groups = [];
	for (const day of days) {
		const last = groups.at(-1);
		if (last?.rate === day.rate) last.to = day.date;
		else groups.push({
			from: day.date,
			to: day.date,
			rate: day.rate
		});
	}
	const label = (day) => day.slice(8, 10) + "/" + day.slice(5, 7);
	return groups.map((g) => `${label(g.from)}${g.from === g.to ? "" : "–" + label(g.to)}: ${goal(g.rate)}`).join("\n");
}
function weeklySummarySheets(data) {
	const name = (id) => data.directory.find((r) => r.id === id)?.name || "", date = (s) => /* @__PURE__ */ new Date(s + "T00:00:00Z"), percent = (value) => value === null ? null : {
		value,
		format: "percent"
	};
	const col = (index) => {
		let label = "";
		for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) label = String.fromCharCode(65 + (n - 1) % 26) + label;
		return label;
	}, offset = 3 + data.workDays.length, quantityCol = col(offset), targetCol = col(offset + 1);
	const mainHeaders = [
		"Nhân sự",
		"Vai trò",
		"KPI chung",
		...data.workDays.map((day) => weeklyDayLabel(day) + "\nCuboid / bài QC"),
		"Cuboid tuần",
		"KPI tuần",
		"Tiến độ tuần (%)",
		"Kết quả tuần",
		"Ngày đạt KPI",
		"Ngày tính KPI",
		"Lượt QC",
		"Rework (lượt)",
		"Nghỉ quy đổi (ngày)",
		"Đi trễ (lần)",
		"Tác phong chưa đúng (ngày)",
		"Quality (%)",
		"Cơ sở quality",
		"Số đạt QC lần đầu",
		"Ghi chú"
	];
	const mainRows = data.rows.map((r, i) => {
		const line = i + 2;
		return [
			r.name,
			r.role,
			weeklyKpiGoal(r, data.workDays),
			...data.workDays.map((day) => weeklyDayProgress(r, r.daily.find((d) => d.date === day))),
			r.quantity,
			r.target,
			r.ratio === null ? null : {
				formula: `IF(${targetCol}${line}>0,${quantityCol}${line}/${targetCol}${line},"")`,
				value: r.ratio ?? "",
				format: "percent"
			},
			r.result,
			r.daysMet,
			r.kpiDays,
			r.qcRounds,
			r.reworkCount,
			r.offEquivalent,
			r.lateDays,
			r.conductBad,
			percent(r.quality),
			r.qualityBasis,
			r.closedTotals ? r.closedTotals.qualityPassed : r.qualityId !== null ? r.qualityIdPassed : r.qualityCuboid !== null ? r.qualityCuboidPassed : null,
			r.notes.join("; ")
		];
	});
	const teamDays = data.workDays.map((day) => {
		const entries = data.rows.map((r) => ({
			row: r,
			day: r.daily.find((d) => d.date === day)
		})), future = entries.every((e) => e.day.future), unallocated = entries.some((e) => e.row.dailyUnallocated), hasData = entries.some((e) => e.day.hasReport || e.day.qcJobs), quantity = entries.reduce((n, e) => n + (e.day.quantity || 0), 0), jobs = entries.reduce((n, e) => n + (e.day.qcJobs || 0), 0);
		return future || unallocated || !hasData ? null : `${quantity}/${entries.some((e) => e.day.qcJobs === null) ? jobs ? jobs + "+?" : "—" : jobs}`;
	});
	const totalLine = mainRows.length + 2, sum = (index, value) => ({
		formula: mainRows.length ? `SUM(${col(index)}2:${col(index)}${mainRows.length + 1})` : "0",
		value
	});
	const total = [
		"TỔNG TEAM",
		"",
		null,
		...teamDays,
		sum(offset, data.totals.quantity),
		sum(offset + 1, data.totals.target),
		{
			formula: `IF(${targetCol}${totalLine}>0,${quantityCol}${totalLine}/${targetCol}${totalLine},"")`,
			value: data.totals.ratio ?? "",
			format: "percent"
		},
		"",
		null,
		null,
		sum(offset + 6, data.totals.qcRounds),
		sum(offset + 7, data.totals.reworkCount),
		sum(offset + 8, data.totals.offEquivalent),
		sum(offset + 9, data.rows.reduce((n, r) => n + r.lateDays, 0)),
		sum(offset + 10, data.rows.reduce((n, r) => n + r.conductBad, 0)),
		percent(data.totals.quality),
		"",
		data.totals.qualityIdChecked ? data.totals.qualityIdPassed : null,
		"KPI chung QA/QC: cuboid cần làm/2 bài cần QC mỗi ngày; cột ngày là thực tế"
	];
	return [
		{
			name: "Tong hop tuan",
			rows: [
				mainHeaders,
				...mainRows,
				total
			],
			widths: [
				28,
				14,
				27,
				...data.workDays.map(() => 19),
				16,
				15,
				16,
				20,
				14,
				14,
				12,
				14,
				17,
				13,
				19,
				14,
				27,
				18,
				48
			],
			freezeColumns: 3,
			totalRow: true
		},
		{
			name: "KPI tung ngay",
			rows: [[
				"Ngày",
				"Nhân sự",
				"Vai trò",
				"Cuboid / bài QC trong ngày",
				"Mức KPI riêng",
				"Cuboid đã làm",
				"KPI ngày",
				"Tiến độ (%)",
				"Kết quả",
				"Job đã báo cáo",
				"Lượt QC trong ngày",
				"Rework",
				"Điểm danh",
				"Tác phong",
				"Nghỉ quy đổi"
			], ...data.rows.flatMap((r) => r.daily.map((d) => [
				date(d.date),
				r.name,
				r.role,
				weeklyDayProgress(r, d),
				d.rate,
				d.quantity,
				d.target,
				percent(d.ratio),
				d.result,
				d.jobs,
				d.qcRounds,
				d.rework,
				d.attendance,
				d.conduct,
				d.offEquivalent
			]))]
		},
		{
			name: "QC va chat luong",
			rows: [
				[
					"Ngày QC",
					"Người QC",
					"Annotator",
					"Task ID",
					"Job ID",
					"Từ Object ID",
					"Đến Object ID",
					"ID đã kiểm",
					"ID đạt",
					"ID có lỗi",
					"Số log lỗi",
					"Kết quả",
					"Nhận xét"
				],
				...data.qcEvents.map((e) => [
					date(e.date),
					name(e.reviewerId),
					name(e.assigneeId),
					e.taskCode,
					e.jobId,
					e.rangeStart,
					e.endId,
					e.checkedIds,
					e.passedIds,
					e.failedIds,
					e.errorCount,
					e.verdict === "passed" ? "Đạt" : "Có lỗi",
					e.note
				]),
				...data.qcReported.map((q) => [
					date(q.date),
					name(q.reviewerId),
					"",
					"",
					q.jobIds.join(", "),
					"",
					"",
					q.checkedIds,
					null,
					null,
					null,
					"QC theo báo cáo",
					q.label
				])
			]
		},
		{
			name: "Diem danh tac phong",
			rows: [[
				"Ngày",
				"Nhân sự",
				"Điểm danh",
				"Trễ (phút)",
				"Tác phong",
				"Nghỉ quy đổi (ngày)",
				"Điểm danh mặc định",
				"Tác phong mặc định"
			], ...data.rows.flatMap((r) => r.daily.map((d) => [
				date(d.date),
				r.name,
				d.attendance,
				d.lateMinutes,
				d.conduct,
				d.offEquivalent,
				d.attendanceDefault ? "Có" : "Không",
				d.conductDefault ? "Có" : "Không"
			]))]
		},
		{
			name: "Cong viec trong tuan",
			rows: [[
				"Ngày",
				"Nhân sự",
				"Task ID",
				"Job ID",
				"ID làm tới",
				"Hoạt động",
				"Cuboid đã làm",
				"Sửa lỗi",
				"Phút thực tế",
				"Vướng mắc",
				"Kế hoạch tiếp theo"
			], ...data.work.map((w) => [
				date(w.date),
				w.name,
				w.taskCode,
				w.jobId,
				w.endId,
				w.activity,
				w.quantity,
				w.rework,
				w.minutes,
				w.issue,
				w.nextPlan
			])]
		}
	];
}
//#endregion
//#region lib/qa.ts
var QA_CATEGORIES = [
	"Annotation",
	"QA/QC",
	"Tool / CVAT",
	"KPI / Báo cáo",
	"Khác"
];
//#endregion
//#region lib/qa-workflow.ts
var id$2 = stringType().min(1).max(100), revision = numberType().int().positive();
var questionSchema = objectType({
	id: id$2.optional(),
	revision: revision.optional(),
	title: stringType().trim().min(5, "Tiêu đề cần ít nhất 5 ký tự").max(200),
	content: stringType().trim().min(3, "Mô tả rõ vấn đề cần hỏi").max(1e4),
	category: enumType(QA_CATEGORIES).default("Annotation"),
	context: stringType().trim().max(300).default("")
});
var answerSchema = objectType({
	id: id$2.optional(),
	revision: revision.optional(),
	questionId: id$2,
	content: stringType().trim().min(1, "Nhập câu trả lời").max(1e4)
});
var sameRevision = (row, value) => ensure(row.revision === value, "Nội dung đã thay đổi. Làm mới và kiểm tra lại trước khi lưu.", 409);
var canEdit = (actor, row) => ensure(actor.role === "Lead" || row.owner_id === actor.id, "Chỉ tác giả hoặc Lead được chỉnh sửa nội dung này", 403);
var reopened = (question) => ({
	...question.data,
	acceptedAnswerId: null,
	frequent: false
});
async function qaAction(hub, actor, action, input) {
	if (![
		"qa-question",
		"qa-answer",
		"qa-accept",
		"qa-frequent"
	].includes(action)) return null;
	ensure(actor.state === "active", "Tài khoản chưa hoạt động", 403);
	if (action === "qa-question") {
		const data = questionSchema.parse(input), old = data.id ? await hub.get(data.id, "qa-question") : null;
		if (old) {
			canEdit(actor, old);
			sameRevision(old, data.revision);
		}
		const content = {
			title: data.title,
			content: data.content,
			category: data.category,
			context: data.context
		};
		if (old && Object.entries(content).every(([key, value]) => old.data[key] === value)) return {
			ok: true,
			id: old.id
		};
		return hub.commit(actor, old ? "Sửa câu hỏi" : "Đăng câu hỏi", old, "qa-question", {
			...content,
			acceptedAnswerId: null,
			frequent: false
		}, {
			owner_id: old?.owner_id || actor.id,
			status: "open"
		});
	}
	if (action === "qa-answer") {
		const data = answerSchema.parse(input), question = await hub.get(data.questionId, "qa-question"), old = data.id ? await hub.get(data.id, "qa-answer") : null;
		if (old) {
			canEdit(actor, old);
			sameRevision(old, data.revision);
			ensure(old.data.questionId === question.id, "Không được chuyển câu trả lời sang câu hỏi khác");
			if (old.data.content === data.content) return {
				ok: true,
				id: old.id
			};
		}
		const extras = old && question.data.acceptedAnswerId === old.id ? [hub.replace(question, reopened(question), "open")] : [];
		return hub.commit(actor, old ? "Sửa câu trả lời" : "Trả lời câu hỏi", old, "qa-answer", {
			questionId: question.id,
			content: data.content
		}, {
			owner_id: old?.owner_id || actor.id,
			status: "active"
		}, extras);
	}
	if (action === "qa-accept") {
		const data = objectType({
			id: id$2,
			revision,
			answerId: id$2.nullable()
		}).parse(input), question = await hub.get(data.id, "qa-question");
		canEdit(actor, question);
		sameRevision(question, data.revision);
		if (data.answerId) ensure((await hub.get(data.answerId, "qa-answer")).data.questionId === question.id, "Câu trả lời không thuộc câu hỏi này");
		return hub.commit(actor, data.answerId ? "Chọn câu trả lời giải đáp" : "Mở lại câu hỏi", question, "qa-question", {
			...question.data,
			acceptedAnswerId: data.answerId,
			frequent: data.answerId ? !!question.data.frequent : false
		}, { status: data.answerId ? "resolved" : "open" });
	}
	hub.lead(actor);
	const data = objectType({
		id: id$2,
		revision,
		frequent: booleanType()
	}).parse(input), question = await hub.get(data.id, "qa-question");
	sameRevision(question, data.revision);
	if (data.frequent) {
		ensure(question.status === "resolved" && question.data.acceptedAnswerId, "Chọn câu trả lời giải đáp trước khi đánh dấu thường gặp");
		ensure((await hub.get(question.data.acceptedAnswerId, "qa-answer")).data.questionId === question.id, "Câu trả lời không thuộc câu hỏi này");
	}
	return hub.commit(actor, data.frequent ? "Đánh dấu câu hỏi thường gặp" : "Bỏ đánh dấu thường gặp", question, "qa-question", {
		...question.data,
		frequent: data.frequent
	});
}
//#endregion
//#region lib/qc-offline.ts
var id$1 = stringType().min(1).max(200), objectId = stringType().regex(/^\d{1,30}$/), frame = numberType().int().min(0).max(1e8), stamp = stringType().datetime({ offset: true });
var offlineLogSchema = objectType({
	id: id$1,
	frameStart: frame,
	frameEnd: frame,
	description: stringType().trim().min(1).max(2e3),
	solution: stringType().trim().max(2e3).default("")
}).refine((l) => l.frameEnd >= l.frameStart, "Frame kết thúc phải từ frame bắt đầu");
var frames = arrayType(frame).min(1).max(2e3), name = stringType().min(1).max(255);
var offlineSourceSchema = unionType([objectType({
	kind: literalType("datumaro").optional(),
	name,
	sha256: stringType().regex(/^[a-f0-9]{64}$/),
	trackOffset: unionType([literalType(0), literalType(1)]),
	frames
}), objectType({
	kind: literalType("blank"),
	name,
	jobId: objectId,
	idCount: numberType().int().positive().max(5e3),
	trackOffset: literalType(1),
	frames
})]);
var offlineResultSchema = objectType({
	format: literalType("cuboid-qc-result-v1"),
	id: stringType().uuid(),
	appVersion: stringType().max(30),
	source: offlineSourceSchema,
	startedAt: stamp,
	completedAt: stamp,
	checks: arrayType(objectType({
		objectId,
		label: stringType().max(200),
		present: arrayType(frame).min(1).max(2e3),
		doneAt: stamp,
		logs: arrayType(offlineLogSchema).max(2e3)
	})).min(1).max(5e3),
	marks: arrayType(objectType({
		objectId,
		frame,
		codes: stringType().regex(/^[SKZHOD!]{1,7}$/)
	})).max(1e5).optional()
}).superRefine((v, ctx) => {
	const fail = (message) => ctx.addIssue({
		code: "custom",
		message
	}), ids = v.checks.map((c) => /^\d{1,30}$/.test(c.objectId) ? BigInt(c.objectId).toString() : c.objectId), frames = new Set(v.source.frames), logs = v.checks.flatMap((c) => c.logs);
	if (new Set(ids).size !== ids.length) fail("Mỗi ID chỉ có một dòng kiểm tra");
	if (frames.size !== v.source.frames.length) fail("Danh sách frame bị trùng");
	if (logs.length > 2e3 || new Set(logs.map((l) => l.id)).size !== logs.length) fail("Tối đa 2.000 log, mỗi log có mã riêng");
	if (v.checks.reduce((n, c) => n + c.present.length, 0) > 5e5) fail("Ma trận vượt 500.000 ô");
	if (Date.parse(v.completedAt) < Date.parse(v.startedAt)) fail("Thời gian hoàn tất không hợp lệ");
	if (v.marks?.some((m) => !ids.includes(/^\d{1,30}$/.test(m.objectId) ? BigInt(m.objectId).toString() : m.objectId) || !frames.has(m.frame))) fail("Cảnh báo không thuộc ID/frame trong bảng QC");
	if (v.source.kind === "blank") {
		if (v.source.frames.some((f, i) => f !== i)) fail("Bảng trắng phải có frame liên tục từ 0");
		if (v.checks.length !== v.source.idCount || Number.isSafeInteger(v.source.idCount) && Array.from({ length: Math.min(v.source.idCount, 5e3) }, (_, i) => String(i + 1)).some((id) => !ids.includes(id))) fail("Bảng trắng phải kiểm đủ từng ID đã tạo");
		if (v.checks.some((c) => c.present.length !== v.source.frames.length)) fail("Bảng trắng phải kiểm đủ frame của mỗi ID");
	}
	for (const c of v.checks) {
		if (c.present.some((f) => !frames.has(f)) || new Set(c.present).size !== c.present.length) fail("Frame của ID không thuộc bảng QC");
		if (Date.parse(c.doneAt) < Date.parse(v.startedAt) || Date.parse(c.doneAt) > Date.parse(v.completedAt)) fail("Thời điểm kiểm ID không hợp lệ");
		for (const l of c.logs) if (!frames.has(l.frameStart) || !frames.has(l.frameEnd) || !c.present.some((f) => f >= l.frameStart && f <= l.frameEnd)) fail("Log phải nằm trong frame xuất hiện của ID");
	}
});
function offlineCsv(result, context) {
	const cell = (v) => {
		let s = String(v ?? "");
		if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
		return "\"" + s.replace(/"/g, "\"\"") + "\"";
	};
	const rows = [[
		"Nguồn QC",
		"Task",
		"Job",
		"Annotator",
		"QA/QC",
		"ID",
		"Nhãn",
		"Từ frame",
		"Đến frame",
		"Kết quả",
		"Giải thích lỗi",
		"Hướng giải quyết",
		"Thời điểm kiểm"
	]];
	for (const c of result.checks) {
		const base = [
			result.source.name,
			context?.taskCode || "",
			context?.jobId || (result.source.kind === "blank" ? result.source.jobId : ""),
			context?.assigneeName || "",
			context?.reviewerName || "",
			c.objectId,
			c.label
		];
		if (c.logs.length) for (const l of c.logs) rows.push([
			...base,
			l.frameStart,
			l.frameEnd,
			"Có lỗi",
			l.description,
			l.solution,
			c.doneAt
		]);
		else rows.push([
			...base,
			"",
			"",
			"Đã QC · Đạt",
			"",
			"",
			c.doneAt
		]);
	}
	return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
//#endregion
//#region lib/qc-offline-workflow.ts
var uploadSchema = objectType({
	assignmentId: stringType().min(1).max(200),
	revision: numberType().int().positive(),
	result: offlineResultSchema
});
async function importOfflineQc(hub, actor, input) {
	const { assignmentId, revision, result } = uploadSchema.parse(input), assignment = await hub.get(assignmentId, "qc-assignment");
	ensure(actor.role === "Lead" || actor.role === "QA/QC" && assignment.data.reviewerId === actor.id, "Chỉ người QA/QC được giao hoặc Lead được xử lý", 403);
	ensure(assignment.status === "active", "Phân công đã ngừng hoạt động", 409);
	const rows = await hub.rows(), old = rows.find((r) => r.kind === "qc-session" && r.natural_key === "offline:" + result.id);
	if (old) {
		ensure(old.task_id === assignment.task_id && old.data.offlineResult && JSON.stringify(old.data.offlineResult) === JSON.stringify(result), "Mã kết quả đã tồn tại ở Job khác hoặc với nội dung khác", 409);
		return {
			ok: true,
			id: old.id
		};
	}
	ensure(assignment.revision === revision, "Phân công hoặc kết quả Job đã thay đổi; làm mới trước khi tải lên", 409);
	const task = await hub.get(assignment.task_id, "task");
	ensure(result.source.kind !== "blank" || result.source.jobId === task.data.jobId, "Job ID của bảng trắng không trùng Job đã chọn", 409);
	ensure(task.data.assigneeId === assignment.data.assigneeId, "Annotator đã đổi; Lead cần cập nhật phân công", 409);
	ensure(!rows.some((r) => r.kind === "qc-session" && r.task_id === task.id && r.status === "in_progress"), "Còn phiên QC web đang mở; Lead chuyển phiên cũ sang app trước", 409);
	const pending = pendingQcErrors(rows, task.id), changed = /* @__PURE__ */ new Map();
	const errors = result.checks.flatMap((c) => c.logs.map((l) => ({
		objectId: c.objectId,
		frameId: String(l.frameStart),
		frameEnd: String(l.frameEnd),
		description: l.description,
		solution: l.solution,
		fixed: false,
		originReviewId: void 0,
		originErrorIndex: void 0
	})));
	let rechecked = 0;
	for (const p of pending) {
		const c = result.checks.find((c) => BigInt(c.objectId).toString() === p.objectId.replace(/^0+(?=\d)/, ""));
		if (!c) continue;
		if (p.frameId && !c.present.some((f) => f >= Number(p.frameId) && f <= Number(p.frameEnd || p.frameId))) continue;
		const repeated = errors.find((e) => e.objectId === c.objectId && (!p.frameId || Number(e.frameId) <= Number(p.frameEnd || p.frameId) && Number(e.frameEnd) >= Number(p.frameId)));
		const previous = changed.get(p.reviewId) || rows.find((r) => r.id === p.reviewId);
		changed.set(previous.id, {
			...previous,
			data: {
				...previous.data,
				errors: previous.data.errors.map((e, i) => i === p.index ? {
					...e,
					verification: repeated ? "failed" : "passed",
					verifiedBy: actor.id,
					verifiedAt: hub.stamp(),
					verificationNote: "Kiểm lại qua file QC offline " + result.id
				} : e)
			}
		});
		if (repeated && !repeated.originReviewId) {
			repeated.originReviewId = p.reviewId;
			repeated.originErrorIndex = p.index;
		}
		rechecked++;
	}
	const members = await hub.members(), name = (id) => members.find((m) => m.id === id)?.name || id;
	const context = {
		taskCode: task.data.code || "",
		jobId: task.data.jobId || "",
		assigneeId: assignment.data.assigneeId,
		assigneeName: name(assignment.data.assigneeId),
		reviewerId: assignment.data.reviewerId,
		reviewerName: name(assignment.data.reviewerId)
	};
	const sorted = [...result.checks].sort((a, b) => BigInt(a.objectId) < BigInt(b.objectId) ? -1 : 1), rangeStart = sorted[0].objectId, endId = sorted.at(-1).objectId;
	const idChecks = result.checks.map((c) => ({
		objectId: c.objectId,
		result: c.logs.length ? "changes" : "passed",
		frameId: "",
		description: c.logs.map((l) => l.description).join("; "),
		frameLogs: c.logs.map((l) => ({
			id: l.id,
			frameId: String(l.frameStart),
			frameEnd: String(l.frameEnd),
			description: l.description,
			solution: l.solution
		}))
	}));
	const sessionId = crypto.randomUUID(), reviewId = crypto.randomUUID(), verdict = errors.length ? "changes" : "passed", checkedAt = hub.stamp();
	const reviewData = {
		mode: "daily",
		offline: true,
		sourceKind: result.source.kind || "datumaro",
		sessionId,
		fixerId: context.assigneeId,
		taskCode: context.taskCode,
		jobId: context.jobId,
		rangeStart,
		endId,
		startedAt: result.startedAt,
		checkedAt,
		round: rows.filter((r) => r.kind === "review" && r.task_id === task.id).length + 1,
		first: false,
		scope: "daily",
		verdict,
		errors,
		idChecks,
		idCheckedCount: idChecks.length,
		idPassedCount: idChecks.filter((c) => c.result === "passed").length,
		idFailedCount: idChecks.filter((c) => c.result === "changes").length,
		repairStatus: errors.length ? "pending" : "none",
		offlineResultId: result.id,
		sourceHash: result.source.kind === "blank" ? null : result.source.sha256
	};
	await hub.commit(actor, "Tải kết quả QC offline", assignment, "qc-assignment", {
		...assignment.data,
		lastSessionId: sessionId
	}, {}, [
		hub.insert("qc-session", sessionId, {
			assignmentId: assignment.id,
			...context,
			rangeStart,
			endId,
			startedAt: result.startedAt,
			completedAt: checkedAt,
			completedBy: actor.id,
			reviewId,
			errorCount: errors.length,
			newErrorCount: errors.length,
			recheckedCount: rechecked,
			idCheckedCount: idChecks.length,
			offline: true,
			offlineResult: result,
			offlineContext: context
		}, {
			owner_id: context.assigneeId,
			task_id: task.id,
			project_id: task.project_id,
			date: today(hub.now),
			status: "completed",
			natural_key: "offline:" + result.id
		}),
		hub.insert("review", reviewId, reviewData, {
			owner_id: context.reviewerId,
			task_id: task.id,
			project_id: task.project_id,
			date: today(hub.now),
			status: verdict
		}),
		hub.replace(task, task.data),
		...[...changed.values()].map((r) => hub.replace(rows.find((v) => v.id === r.id), r.data)),
		hub.notify(context.assigneeId, errors.length ? "QC offline có log cần sửa" : "Đã nhận kết quả QC offline", "Job " + context.jobId + " · " + idChecks.length + " ID · " + errors.length + " log", "qa")
	]);
	return {
		ok: true,
		id: sessionId
	};
}
//#endregion
//#region lib/domain.ts
var HubError = class extends Error {
	constructor(message, status = 400) {
		super(message);
		this.status = status;
	}
};
var ensure = (ok, message, status = 400) => {
	if (!ok) throw new HubError(message, status);
};
var today = (now = /* @__PURE__ */ new Date()) => new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Ho_Chi_Minh",
	year: "numeric",
	month: "2-digit",
	day: "2-digit"
}).format(now);
function weekStart(date) {
	const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
	return d.toISOString().slice(0, 10);
}
function addDays(date, n) {
	const d = /* @__PURE__ */ new Date(date + "T12:00:00Z");
	d.setUTCDate(d.getUTCDate() + n);
	return d.toISOString().slice(0, 10);
}
var TEAM = [
	["Nguyễn Tuấn Khôi", "26ai.khoint2"],
	["Nguyễn Tuấn Minh", "26ai.minhnt3"],
	["Nguyễn Thái Hà", "26ai.hant"],
	["Đào Xuân Tùng", "26ai.tungdx"],
	["Đỗ Thành Long", "26ai.longdt"],
	["Dương Quang Hiệp", "26ai.hiepdq"],
	["Cẩm Vũ Ngọc Thạch", "26ai.thachcvn"],
	["Phạm Nguyễn Tuân", "26ai.tuanpn"],
	["Nguyễn Vũ Quang Minh", "26ai.minhnvq"],
	["Phan Ngọc Hòa", "26ai.hoapn"]
];
var DEFAULT_SETTINGS = {
	workStart: "08:30",
	workEnd: "17:30",
	lateGrace: 10,
	reportDeadline: "17:00",
	dailyPolicyVersion: 1,
	workDays: [
		1,
		2,
		3,
		4,
		5
	],
	kpiStartDate: "2026-10-20",
	kpiWorkingSaturday: "2026-10-24",
	errorTypes: [
		"Sai vị trí",
		"Kích thước",
		"Hướng",
		"Class",
		"Thiếu/thừa object",
		"Tracking/ID",
		"Khác"
	]
};
var date$1 = stringType().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, "Ngày không hợp lệ");
var str = stringType().trim().max(1e4);
var required = stringType().trim().min(1, "Vui lòng điền thông tin bắt buộc").max(500);
var num = coerce.number().finite().min(0).max(1e8);
var url = stringType().trim().max(2e3).refine((v) => !v || /^https?:\/\//i.test(v), "Link phải bắt đầu bằng https:// hoặc http://");
var id = stringType().min(1).max(100);
var projectSchema = objectType({
	name: required,
	description: str.default(""),
	instructions: str.default(""),
	unit: enumType([
		"frame",
		"cuboid",
		"scene"
	]),
	target: num.nullable().default(null),
	status: enumType(["active", "archived"]).default("active")
});
var taskSchema = objectType({
	code: stringType().trim().max(500).default(""),
	jobId: stringType().trim().regex(/^\d*$/, "Job ID chỉ gồm chữ số").max(30).default(""),
	title: required,
	frameCount: num.int().positive().nullable().optional(),
	projectId: id,
	assigneeId: id,
	reviewerId: id,
	link: url.default(""),
	assignedDate: date$1,
	deadline: date$1,
	priority: enumType([
		"low",
		"normal",
		"high",
		"urgent"
	]),
	quantity: num.positive(),
	note: str.default("")
}).refine((v) => v.code || v.jobId, {
	message: "Nhập Task ID / mã batch hoặc Job ID",
	path: ["code"]
});
var lineSchema = objectType({
	taskId: id,
	taskCode: stringType().default(""),
	jobId: stringType().default(""),
	endId: stringType().trim().regex(/^\d*$/, "ID đã làm tới chỉ gồm chữ số").max(30).default(""),
	activity: enumType(["annotation", "qc"]).default("annotation"),
	productionMethod: enumType([
		"datumaro-baseline-v1",
		"keyframe-v1",
		"legacy"
	]).optional(),
	countSourceId: id.optional(),
	countRunId: id.optional(),
	idCount: num.int().nullable().optional(),
	minutes: num.positive().max(1440),
	quantity: num,
	rework: num,
	work: str.default(""),
	issue: str.default(""),
	evidence: url.default("")
});
var reportSchema = objectType({
	date: date$1,
	memberId: id.optional(),
	lines: arrayType(lineSchema).min(1).max(50),
	completed: str.default(""),
	blockers: str.default(""),
	support: str.default(""),
	nextPlan: str.default(""),
	submit: booleanType().default(false)
});
var weeklySchema = objectType({
	date: date$1,
	highlights: str.default(""),
	difficulties: str.default(""),
	improvements: str.default(""),
	nextPlan: str.default(""),
	submit: booleanType().default(false)
});
var reviewSchema = objectType({
	taskId: id,
	productionDate: date$1.optional(),
	checked: num.positive(),
	passed: num,
	failed: num,
	scope: enumType(["full", "sample"]),
	sample: str.default(""),
	verdict: enumType(["passed", "changes"]),
	note: str.default(""),
	errors: arrayType(objectType({
		type: required,
		severity: enumType([
			"minor",
			"major",
			"critical"
		]),
		description: required,
		evidence: url.default("")
	})).max(100)
});
var Hub = class {
	constructor(db, leadEmail, now = /* @__PURE__ */ new Date()) {
		this.db = db;
		this.leadEmail = leadEmail;
		this.now = now;
	}
	stamp() {
		return this.now.toISOString();
	}
	async members() {
		return (await this.db.prepare("SELECT * FROM members ORDER BY created_at,id").all()).results;
	}
	async rows(kind) {
		return (await (kind ? this.db.prepare("SELECT * FROM records WHERE kind=? ORDER BY created_at DESC").bind(kind) : this.db.prepare("SELECT * FROM records ORDER BY created_at DESC")).all()).results.map((r) => ({
			...r,
			data: JSON.parse(r.data)
		}));
	}
	async get(recordId, kind) {
		const r = await this.db.prepare("SELECT * FROM records WHERE id=?").bind(recordId).first();
		ensure(r && (!kind || r.kind === kind), "Không tìm thấy dữ liệu", 404);
		return {
			...r,
			data: JSON.parse(r.data)
		};
	}
	async current(identity) {
		const m = await this.db.prepare("SELECT * FROM members WHERE auth_id=? AND state='active'").bind(identity.userId).first();
		ensure(m, "Tài khoản chưa được kích hoạt hoặc đã bị vô hiệu hóa", 403);
		return m;
	}
	lead(m) {
		ensure(m.role === "Lead", "Chỉ Lead được thực hiện thao tác này", 403);
	}
	attendanceLead(m) {
		ensure(m.role === "Lead" && m.id === "member-0", "Chỉ Nguyễn Tuấn Khôi được đánh điểm danh, đi trễ và tác phong", 403);
	}
	async setup(identity) {
		ensure(this.leadEmail && identity.email.toLowerCase() === this.leadEmail.toLowerCase(), "Chỉ email Lead đã cấu hình mới được thiết lập team", 403);
		ensure(!(await this.members()).length, "Team đã được thiết lập", 409);
		const stamp = this.stamp();
		const stmts = TEAM.map(([name, handle], i) => this.db.prepare("INSERT INTO members(id,name,email,auth_id,role,state,created_at) VALUES(?,?,?,?,?,?,?)").bind("member-" + i, name, handle + "@vinuni.edu.vn", i === 0 ? identity.userId : null, i === 0 ? "Lead" : "Annotator", i === 0 ? "active" : "pending", stamp));
		stmts.push(this.insert("settings", "settings", DEFAULT_SETTINGS, { natural_key: "settings" }));
		for (const r of initial_import_default) stmts.push(this.insert(r.kind, r.id, r.data, r));
		stmts.push(this.audit("member-0", "Thiết lập team 10 người", "team", null, { count: 10 }));
		await this.db.batch(stmts);
		return { ok: true };
	}
	async activate(identity) {
		const member = await this.db.prepare("SELECT * FROM members WHERE lower(email)=?").bind(identity.email.toLowerCase()).first();
		ensure(member && member.state === "invited" && member.invite_expires > this.stamp() && !member.auth_id, "Lời mời không hợp lệ hoặc đã hết hạn. Liên hệ Lead.", 403);
		ensure((await this.db.batch([this.db.prepare("UPDATE members SET auth_id=?,state='active',invite_expires=NULL WHERE id=? AND state='invited' AND auth_id IS NULL").bind(identity.userId, member.id), this.audit(member.id, "Chấp nhận lời mời", member.id, null, { email: member.email })]))[0].meta?.changes === 1, "Lời mời đã được sử dụng", 409);
		return { ok: true };
	}
	insert(kind, recordId, data, meta = {}) {
		return this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?,?)").bind(recordId, kind, meta.natural_key || recordId, meta.owner_id || null, meta.project_id || null, meta.task_id || null, meta.date || null, meta.status || "active", JSON.stringify(data), this.stamp(), this.stamp());
	}
	replace(row, data, status = row.status, naturalKey = row.natural_key) {
		return this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at,natural_key=CASE WHEN records.revision=? THEN excluded.natural_key ELSE NULL END").bind(row.id, row.kind, naturalKey, row.owner_id, row.project_id, row.task_id, row.date, status, row.revision + 1, JSON.stringify(data), row.created_at, this.stamp(), row.revision);
	}
	audit(actor, action, entityId, before, after) {
		return this.db.prepare("INSERT INTO audit(id,actor_id,action,entity_id,before,after,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(), actor, action, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), this.stamp());
	}
	notify(owner, title, detail, page) {
		return this.insert("notification", crypto.randomUUID(), {
			title,
			detail,
			page,
			read: false
		}, { owner_id: owner });
	}
	async commit(m, action, row, kind, data, meta = {}, extras = []) {
		const recordId = row?.id || crypto.randomUUID();
		await this.db.batch([
			row ? this.replace(row, data, meta.status, meta.natural_key) : this.insert(kind, recordId, data, meta),
			...extras,
			this.audit(m.id, action, recordId, row, {
				...meta,
				data
			})
		]);
		return {
			ok: true,
			id: recordId
		};
	}
	canTask(m, r) {
		return m.role === "Lead" || r.data.assigneeId === m.id || m.role === "QA/QC" && r.data.reviewerId === m.id;
	}
	async visible(m) {
		const all = await this.rows();
		const qcTaskIds = new Set(all.filter((r) => ["qc-session", "qc-assignment"].includes(r.kind) && m.role === "QA/QC" && r.data.reviewerId === m.id).map((r) => r.task_id));
		const tasks = all.filter((r) => r.kind === "task" && (this.canTask(m, r) || qcTaskIds.has(r.id)));
		const taskIds = new Set(tasks.map((t) => t.id));
		const projectIds = new Set(tasks.map((t) => t.project_id));
		const reportIds = new Set(all.filter((r) => ["daily", "weekly"].includes(r.kind) && (m.role === "Lead" || r.owner_id === m.id)).map((r) => r.id));
		return all.flatMap((r) => {
			if (r.kind === "qc-session" && r.data.offlineResult) {
				const { offlineResult, ...data } = r.data;
				r = {
					...r,
					data
				};
			}
			if (m.role === "Lead") return [r];
			if (r.kind === "task") return taskIds.has(r.id) ? [r] : [];
			if (r.kind === "project") return projectIds.has(r.id) ? [r] : [];
			if ([
				"settings",
				"document",
				"qa-question",
				"qa-answer"
			].includes(r.kind)) return [r];
			if (["kpi-exclusion", "kpi-rate"].includes(r.kind)) return !r.owner_id || r.owner_id === m.id ? [r] : [];
			if ([
				"attendance",
				"request",
				"weekly",
				"notification"
			].includes(r.kind)) return r.owner_id === m.id ? [r] : [];
			if (["manual-rework", "weekly-snapshot"].includes(r.kind)) return r.owner_id === m.id ? [r] : [];
			if (r.kind === "target") return r.owner_id === m.id ? [r] : [];
			if (["qc-session", "qc-assignment"].includes(r.kind)) return r.data.assigneeId === m.id || m.role === "QA/QC" && r.data.reviewerId === m.id ? [r] : [];
			if ([
				"qc-basic",
				"kpi-count",
				"kpi-source"
			].includes(r.kind)) return r.owner_id === m.id || m.role === "QA/QC" && taskIds.has(r.task_id || "") ? [r] : [];
			if (["review", "comment"].includes(r.kind)) return taskIds.has(r.task_id || "") ? [r] : [];
			if (r.kind === "daily") {
				if (r.owner_id === m.id) return [r];
				if (m.role === "QA/QC" && r.status !== "draft") {
					const lines = r.data.lines.filter((l) => tasks.some((t) => t.id === l.taskId && (t.data.reviewerId === m.id || qcTaskIds.has(t.id))));
					return lines.length ? [{
						...r,
						data: {
							lines,
							scoped: true
						}
					}] : [];
				}
			}
			if (r.kind === "file") return r.owner_id === m.id || taskIds.has(r.data.entityId) || reportIds.has(r.data.entityId) ? [r] : [];
			return [];
		});
	}
	async state(identity) {
		const members = await this.members();
		if (!members.length) return {
			needsSetup: true,
			leadEligible: identity.email.toLowerCase() === this.leadEmail.toLowerCase(),
			email: identity.email
		};
		const me = members.find((m) => m.auth_id === identity.userId && m.state === "active");
		if (!me) {
			const invite = members.find((m) => m.email.toLowerCase() === identity.email.toLowerCase() && m.state === "invited" && (m.invite_expires || "") > this.stamp());
			return {
				needsActivation: true,
				invited: !!invite,
				name: invite?.name,
				email: identity.email
			};
		}
		await this.ensureAttendanceDefaults();
		await ensureQcAssignments(this);
		const rows = await this.visible(me);
		return {
			me,
			members: me.role === "Lead" ? members : members.filter((m) => m.id === me.id || rows.some((r) => r.kind === "task" && [r.data.assigneeId, r.data.reviewerId].includes(m.id) || ["qa-question", "qa-answer"].includes(r.kind) && r.owner_id === m.id)).map((m) => ({
				id: m.id,
				name: m.name,
				role: m.role,
				state: m.state
			})),
			teamSize: members.length,
			records: rows,
			kpiSummary: await this.kpiSummary(me, void 0, void 0, rows),
			serverDate: today(this.now),
			serverTime: this.stamp(),
			audit: me.role === "Lead" ? (await this.db.prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT 300").all()).results : []
		};
	}
	async kpiSummary(m, requested, owner, visible) {
		const period = requested || (m.role === "Lead" ? "cumulative" : "weekly"), memberId = owner || (m.role === "Lead" ? "team" : m.id);
		ensure(["weekly", "cumulative"].includes(period), "Kỳ KPI không hợp lệ");
		ensure(period !== "cumulative" || m.role === "Lead", "Chỉ Lead được xem KPI lũy kế", 403);
		ensure(m.role === "Lead" || memberId === m.id, "Chỉ được xem KPI của bản thân", 403);
		const members = await this.members(), all = visible || await this.visible(m), asOf = today(this.now);
		ensure(memberId === "team" || members.some((member) => member.id === memberId), "Không tìm thấy nhân sự", 404);
		const selected = members.filter((member) => member.state === "active" && (memberId === "team" || member.id === memberId) && (member.role !== "Lead" || all.some((r) => r.kind === "daily" && r.owner_id === member.id)));
		const calculate = (id) => period === "weekly" ? weeklyKpi(id, all, asOf) : cumulativeKpi(id, all, asOf), range = calculate(m.id);
		return {
			period,
			start: range.start,
			end: range.end,
			asOf,
			rows: selected.map((member) => ({
				memberId: member.id,
				kpi: calculate(member.id)
			}))
		};
	}
	async settings() {
		const row = await this.get("settings", "settings");
		if (!row.data.dailyPolicyVersion) {
			const data = {
				...row.data,
				reportDeadline: DAILY_REPORT_DEADLINE,
				dailyPolicyVersion: 1
			};
			await this.db.batch([this.replace(row, data), this.audit("system:daily-policy", "Áp dụng hạn Daily Report 17:00", row.id, row, { data })]);
			return {
				...DEFAULT_SETTINGS,
				...data
			};
		}
		return {
			...DEFAULT_SETTINGS,
			...row.data
		};
	}
	async ensureAttendanceDefaults() {
		const day = today(this.now), members = (await this.members()).filter((m) => m.state === "active");
		if (!members.length) return;
		const policy = (await this.rows("settings")).find((r) => r.id === "attendance-default-policy");
		const start = policy?.data.lastDate || day, statements = [], settings = await this.settings();
		for (let d = start; d <= day; d = addDays(d, 1)) for (const m of members) {
			if (today(new Date(m.created_at)) > d || !scheduledWorkday(d, settings)) continue;
			const data = {
				checkIn: null,
				checkOut: null,
				lateMinutes: 0,
				conduct: "Đúng quy định",
				note: "",
				defaulted: true,
				markedBy: "system:defaults",
				markedAt: this.stamp()
			};
			statements.push(this.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,date,status,revision,data,created_at,updated_at) VALUES(?,'attendance',?,?,?,'present',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind(crypto.randomUUID(), m.id + ":" + d, m.id, d, JSON.stringify(data), this.stamp(), this.stamp()));
			statements.push(this.db.prepare("UPDATE records SET data=json_set(data,'$.conduct','Đúng quy định','$.conductDefault',1),revision=revision+1,updated_at=? WHERE kind='attendance' AND owner_id=? AND date=? AND json_extract(data,'$.conduct') IS NULL").bind(this.stamp(), m.id, d));
		}
		const defaultCount = statements.length, data = {
			startDate: policy?.data.startDate || day,
			lastDate: day
		};
		if (!policy) statements.push(this.db.prepare("INSERT INTO records(id,kind,natural_key,status,revision,data,created_at,updated_at) VALUES('attendance-default-policy','settings','attendance-default-policy','active',1,?,?,?) ON CONFLICT(kind,natural_key) DO NOTHING").bind(JSON.stringify(data), this.stamp(), this.stamp()));
		else if (policy.data.lastDate < day) statements.push(this.db.prepare("UPDATE records SET data=json_set(data,'$.lastDate',?),revision=revision+1,updated_at=? WHERE id='attendance-default-policy' AND json_extract(data,'$.lastDate')<?").bind(day, this.stamp(), day));
		if (statements.length) {
			const changes = (await this.db.batch(statements)).slice(0, defaultCount).reduce((n, r) => n + (r.meta?.changes || 0), 0);
			if (changes) await this.db.batch([this.audit("system:defaults", "Điểm danh và tác phong mặc định", day, null, {
				from: start,
				to: day,
				changes
			})]);
		}
	}
	async planTask(m, b) {
		this.lead(m);
		const data = taskSchema.parse(b);
		if (data.jobId && data.code) {
			ensure(/^\d+$/.test(data.code), "Task ID CVAT phải gồm chữ số khi có Job ID");
			data.link = `https://cvat-test.vantixapps.net/tasks/${data.code}/jobs/${data.jobId}`;
		} else if (data.jobId && /^https:\/\/cvat-test\.vantixapps\.net\/tasks\//i.test(data.link)) data.link = "";
		ensure(data.deadline >= data.assignedDate, "Deadline phải sau ngày giao");
		ensure((await this.get(data.projectId, "project")).status === "active", "Dự án đã được lưu trữ");
		const members = await this.members();
		ensure(members.some((x) => x.id === data.assigneeId && x.state !== "disabled"), "Người thực hiện phải có trong danh sách và không bị vô hiệu hóa");
		ensure(members.some((x) => x.id === data.reviewerId && x.state !== "disabled" && ["Lead", "QA/QC"].includes(x.role)), "Người kiểm tra phải là Lead hoặc QA/QC không bị vô hiệu hóa");
		ensure(!(await this.rows("task")).some((t) => t.data.code === data.code && (t.data.jobId || "") === data.jobId && t.id !== b.id), "Cặp Task ID / Job ID đã tồn tại");
		const old = b.id ? await this.get(b.id, "task") : null;
		ensure(!old || old.project_id === data.projectId, "Không thể chuyển task sang dự án khác");
		ensure(!old || old.status !== "done", "Task hoàn thành đã được khóa");
		ensure(!old || data.quantity >= old.data.completed, "Khối lượng giao không được thấp hơn tiến độ đã làm");
		if (old) {
			const reported = (await this.rows("daily")).flatMap((r) => r.data.lines).filter((l) => l.taskId === old.id).reduce((n, l) => n + l.quantity, 0);
			ensure(data.quantity >= reported, "Khối lượng giao không được thấp hơn sản lượng đã ghi nhận");
		}
		const recordId = old?.id || crypto.randomUUID(), taskData = {
			...old?.data,
			...data,
			completed: old?.data.completed || 0
		}, meta = {
			project_id: data.projectId,
			natural_key: data.code + ":" + data.jobId,
			status: old?.status || "todo"
		};
		return {
			id: recordId,
			data: taskData,
			projectId: data.projectId,
			old,
			statements: [
				old ? this.replace(old, taskData, meta.status, meta.natural_key) : this.insert("task", recordId, taskData, meta),
				this.notify(data.assigneeId, "Task được phân công", data.code + " · " + data.title, "tasks"),
				this.notify(data.reviewerId, "Phân công kiểm tra", data.code, "qa"),
				this.audit(m.id, "Giao / cập nhật task", recordId, old, {
					...meta,
					data: taskData
				})
			]
		};
	}
	async mutate(m, action, input) {
		const b = input || {};
		if (action === "qc-offline-migrate") {
			this.lead(m);
			const data = objectType({
				id: stringType(),
				revision: numberType().int().positive()
			}).parse(b), assignment = await this.get(data.id, "qc-assignment");
			ensure(assignment.revision === data.revision, "Phân công đã thay đổi; làm mới trước khi chuyển", 409);
			const active = (await this.rows("qc-session")).filter((r) => r.task_id === assignment.task_id && r.status === "in_progress");
			return this.commit(m, "Chuyển phiên QC web sang app offline", assignment, "qc-assignment", {
				...assignment.data,
				migratedOfflineAt: this.stamp()
			}, {}, active.map((r) => this.replace(r, {
				...r.data,
				archivedForOfflineAt: this.stamp(),
				archivedBy: m.id
			}, "superseded")));
		}
		if (action === "qc-offline-import") return importOfflineQc(this, m, b);
		if (action.startsWith("qa-")) {
			const result = await qaAction(this, m, action, b);
			if (result) return result;
		}
		if (action === "weekly-snapshot") {
			this.lead(m);
			const totals = objectType({
				quantity: num,
				target: num,
				daysMet: num.int().max(7),
				kpiDays: num.int().max(7),
				qcRounds: num.int(),
				reworkCount: num.int(),
				offEquivalent: num.max(7),
				lateDays: num.int().max(7),
				conductBad: num.int().max(7),
				quality: numberType().min(0).max(1).nullable(),
				qualityBasis: stringType().max(500),
				qualityPassed: num.int().nullable()
			});
			const data = objectType({
				memberId: id,
				week: date$1,
				asOf: date$1,
				role: enumType([
					"Lead",
					"QA/QC",
					"Annotator"
				]),
				totals
			}).parse(b), start = weekStart(data.week), end = addDays(start, 6);
			ensure(end < today(this.now), "Chỉ lưu tổng đã chốt cho tuần đã kết thúc");
			ensure(data.asOf >= start && data.asOf <= end, "Ngày chốt phải thuộc tuần");
			ensure(data.totals.daysMet <= data.totals.kpiDays, "Số ngày đạt không vượt số ngày tính KPI");
			ensure((await this.members()).some((v) => v.id === data.memberId), "Không tìm thấy nhân sự");
			const old = (await this.rows("weekly-snapshot")).find((r) => r.owner_id === data.memberId && r.date === start), value = {
				weekEnd: end,
				asOf: data.asOf,
				role: data.role,
				totals: data.totals,
				dailyUnallocated: true
			};
			if (b.revision !== void 0) ensure(b.revision === (old?.revision || 0), "Tổng báo cáo tuần đã đổi; làm mới trước khi lưu.", 409);
			if (old && JSON.stringify(old.data) === JSON.stringify(value)) return {
				ok: true,
				id: old.id
			};
			return this.commit(m, "Lưu tổng báo cáo tuần đã chốt", old || null, "weekly-snapshot", value, {
				owner_id: data.memberId,
				date: start,
				natural_key: start + ":" + data.memberId,
				status: "approved"
			});
		}
		if (["qc-job-assign", "qc-job-start"].includes(action)) return await qcJobAction(this, m, action, b);
		if ([
			"qc-assign",
			"qc-start",
			"qc-result",
			"qc-draft"
		].includes(action)) return await dailyQcAction(this, m, action, b);
		if (action === "manual-rework") {
			this.lead(m);
			const data = objectType({
				memberId: id,
				date: date$1,
				reason: required
			}).parse(b);
			ensure(data.date <= today(this.now), "Ngày rework không được ở tương lai");
			ensure((await this.members()).some((member) => member.id === data.memberId), "Không tìm thấy nhân sự");
			const key = data.memberId + ":" + data.date, old = (await this.rows("manual-rework")).find((r) => r.natural_key === key);
			if (old) {
				ensure(old.data.reason === data.reason, "Ngày này đã có rework thủ công; không cộng trùng", 409);
				return {
					ok: true,
					id: old.id
				};
			}
			return this.commit(m, "Ghi bổ sung rework đã xử lý thủ công", null, "manual-rework", {
				reason: data.reason,
				source: "lead_manual_confirmation",
				recordedBy: m.id,
				recordedAt: this.stamp()
			}, {
				owner_id: data.memberId,
				date: data.date,
				natural_key: key,
				status: "active"
			});
		}
		if (action === "member") {
			this.lead(m);
			const data = objectType({
				name: required,
				email: stringType().email().max(254),
				role: enumType([
					"Lead",
					"QA/QC",
					"Annotator"
				]),
				state: enumType([
					"pending",
					"invited",
					"active",
					"disabled"
				])
			}).parse(b);
			const members = await this.members();
			const old = b.id ? members.find((x) => x.id === b.id) : null;
			ensure(!b.id || old, "Không tìm thấy nhân sự", 404);
			ensure(old?.id !== "member-0" || data.role === "Lead" && data.state === "active", "Cần giữ tài khoản Lead Nguyễn Tuấn Khôi để quản lý điểm danh");
			ensure(!(old?.role === "Lead" && (data.role !== "Lead" || data.state !== "active")) || members.filter((x) => x.role === "Lead" && x.state === "active").length > 1, "Cần giữ ít nhất một Lead đang hoạt động");
			ensure(data.state !== "active" || old?.auth_id, "Tài khoản chỉ kích hoạt sau khi người dùng chấp nhận lời mời");
			ensure(!old?.auth_id || data.email.toLowerCase() === old.email.toLowerCase(), "Không thể đổi email của tài khoản đã kích hoạt");
			const memberId = old?.id || crypto.randomUUID();
			const expires = data.state === "invited" ? new Date(this.now.getTime() + 7 * 864e5).toISOString() : null;
			await this.db.batch([this.db.prepare("INSERT INTO members(id,name,email,role,state,created_at,invite_expires) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,role=excluded.role,state=excluded.state,invite_expires=excluded.invite_expires").bind(memberId, data.name, data.email.toLowerCase(), data.role, data.state, old?.created_at || this.stamp(), expires), this.audit(m.id, data.state === "invited" ? "Mời thành viên" : "Cập nhật nhân sự / phân quyền", memberId, old, data)]);
			return {
				ok: true,
				id: memberId
			};
		}
		if (action === "project") {
			this.lead(m);
			const data = projectSchema.parse(b);
			const old = b.id ? await this.get(b.id, "project") : null;
			if (old && old.data.unit !== data.unit) ensure(!(await this.rows("task")).some((t) => t.project_id === old.id), "Không thể đổi đơn vị sau khi dự án đã có task");
			return this.commit(m, "Lưu dự án", old, "project", data, { status: data.status });
		}
		if (action === "task") {
			const plan = await this.planTask(m, b);
			await this.db.batch(plan.statements);
			return {
				ok: true,
				id: plan.id
			};
		}
		if (action === "progress") {
			const row = await this.get(id.parse(b.id), "task");
			ensure(m.role === "Lead" || row.data.assigneeId === m.id, "Không được sửa task của người khác", 403);
			ensure(row.status !== "done", "Task hoàn thành đã được khóa");
			ensure(row.data.quantity && row.data.deadline, "Lead cần bổ sung khối lượng giao và deadline của task nhập từ sheet");
			const completed = num.parse(b.completed);
			ensure(completed <= row.data.quantity, "Tiến độ không được vượt khối lượng giao");
			const status = enumType([
				"doing",
				"qa",
				"recheck"
			]).parse(b.status);
			ensure({
				todo: ["doing"],
				doing: ["doing", "qa"],
				changes: ["doing", "recheck"],
				recheck: [],
				qa: []
			}[row.status]?.includes(status), "Chuyển trạng thái không hợp lệ");
			if (status === "recheck") {
				const latest = (await this.rows("review")).filter((r) => r.task_id === row.id && r.data.mode !== "daily").sort((a, b) => b.data.round - a.data.round)[0];
				ensure(!latest?.data.errors?.some((e) => !e.fixed), "Cần đánh dấu đã sửa từng lỗi trước khi gửi kiểm tra lại");
			}
			ensure(!["qa", "recheck"].includes(status) || completed > 0, "Cần có sản lượng trước khi gửi kiểm tra");
			const extras = ["qa", "recheck"].includes(status) ? [this.notify(row.data.reviewerId, "Task chờ kiểm tra", row.data.code, "qa")] : [];
			return this.commit(m, "Cập nhật tiến độ task", row, "task", {
				...row.data,
				completed
			}, { status }, extras);
		}
		if (action === "comment") {
			const row = await this.get(id.parse(b.taskId), "task");
			ensure(this.canTask(m, row), "Không có quyền xem task", 403);
			return this.commit(m, "Bình luận task", null, "comment", { text: required.parse(b.text) }, {
				owner_id: m.id,
				task_id: row.id
			});
		}
		if (action === "checkin" || action === "checkout") throw new HubError("Team không tự check-in/check-out. Chỉ Nguyễn Tuấn Khôi được ghi điểm danh.", 403);
		if (action === "attendance-mark") {
			this.attendanceLead(m);
			const data = objectType({
				memberId: id,
				date: date$1,
				status: enumType([
					"present",
					"late",
					"leave",
					"half",
					"absent"
				]),
				lateMinutes: num.max(1440),
				conduct: enumType([
					"Đúng quy định",
					"Chưa đúng quy định",
					"Chưa đánh giá"
				]),
				note: str.default(""),
				checkIn: stringType().default(""),
				checkOut: stringType().default("")
			}).parse(b);
			ensure(data.date <= today(this.now), "Không đánh điểm danh cho ngày tương lai");
			ensure((await this.members()).some((x) => x.id === data.memberId), "Thành viên không tồn tại");
			ensure(data.status !== "late" || data.lateMinutes > 0, "Cần ghi số phút đi trễ");
			ensure(!data.checkOut || data.checkIn, "Không được check-out trước check-in");
			if (data.checkIn) this.validateTimes(data.checkIn, data.checkOut, data.date);
			const old = (await this.rows("attendance")).find((r) => r.owner_id === data.memberId && r.date === data.date);
			return this.commit(m, "Đánh điểm danh / đi trễ / tác phong", old || null, "attendance", {
				...old?.data,
				defaulted: false,
				conductDefault: false,
				checkIn: data.checkIn || null,
				checkOut: data.checkOut || null,
				lateMinutes: data.status === "late" ? data.lateMinutes : 0,
				conduct: data.conduct,
				note: data.note,
				markedBy: m.id,
				markedAt: this.stamp()
			}, {
				owner_id: data.memberId,
				date: data.date,
				natural_key: data.memberId + ":" + data.date,
				status: data.status
			});
		}
		if (action === "request") {
			this.attendanceLead(m);
			const data = objectType({
				type: enumType(["leave", "correction"]),
				date: date$1,
				endDate: date$1,
				reason: required,
				leaveType: enumType([
					"leave",
					"half",
					"absent"
				]).default("leave"),
				checkIn: stringType().default(""),
				checkOut: stringType().default("")
			}).parse(b);
			ensure(data.endDate >= data.date && Date.parse(data.endDate) - Date.parse(data.date) <= 31 * 864e5, "Đơn tối đa 31 ngày");
			if (data.type === "correction") {
				ensure(data.date === data.endDate && data.date <= today(this.now), "Chỉnh công chỉ áp dụng một ngày đã diễn ra");
				this.validateTimes(data.checkIn, data.checkOut, data.date);
			}
			return this.commit(m, "Gửi đơn nghỉ / điều chỉnh công", null, "request", data, {
				owner_id: m.id,
				date: data.date,
				status: "submitted"
			});
		}
		if (action === "request-decision") {
			this.attendanceLead(m);
			const row = await this.get(id.parse(b.id), "request");
			ensure(row.status === "submitted", "Đơn đã được xử lý", 409);
			const approved = booleanType().parse(b.approved);
			const reason = required.parse(b.reason);
			const extras = [];
			if (approved) {
				const all = await this.rows("attendance");
				for (let day = row.data.date; day <= row.data.endDate; day = addDays(day, 1)) {
					const old = all.find((a) => a.owner_id === row.owner_id && a.date === day);
					if (row.data.type === "leave") ensure(!old?.data.checkIn, "Ngày có check-in cần điều chỉnh công riêng");
					const data = row.data.type === "correction" ? {
						...old?.data,
						checkIn: row.data.checkIn || null,
						checkOut: row.data.checkOut || null,
						note: row.data.reason,
						adjustedBy: m.id
					} : {
						...old?.data,
						checkIn: null,
						checkOut: null,
						note: row.data.reason,
						adjustedBy: m.id
					};
					const s = row.data.type === "leave" ? row.data.leaveType : old?.status || "present";
					extras.push(old ? this.replace(old, data, s) : this.insert("attendance", crypto.randomUUID(), data, {
						owner_id: row.owner_id,
						date: day,
						natural_key: row.owner_id + ":" + day,
						status: s
					}));
					extras.push(this.audit(m.id, "Điều chỉnh điểm danh", old?.id || row.id, old, {
						date: day,
						data,
						status: s
					}));
				}
			}
			extras.push(this.notify(row.owner_id, approved ? "Đơn đã được duyệt" : "Đơn bị từ chối", reason, "attendance"));
			return this.commit(m, "Duyệt đơn", row, "request", {
				...row.data,
				decisionReason: reason,
				decidedBy: m.id,
				decidedAt: this.stamp()
			}, { status: approved ? "approved" : "rejected" }, extras);
		}
		if (action === "daily") {
			const data = reportSchema.parse(b);
			ensure(data.date <= today(this.now), "Không gửi báo cáo cho ngày tương lai");
			const owner = (await this.members()).find((member) => member.id === (data.memberId || m.id));
			ensure(owner, "Không tìm thấy nhân sự", 404);
			ensure(m.role === "Lead" || owner.id === m.id, "Chỉ Lead được viết hoặc sửa báo cáo thay thành viên", 403);
			const settings = await this.settings();
			ensure(dailyReportWritable(m, owner.id, data.date, this.now, settings.reportDeadline), `Daily Report chỉ được nhập/sửa trước ${settings.reportDeadline} trong ngày báo cáo. Sau hạn, liên hệ Lead.`, 403);
			ensure(data.lines.reduce((n, l) => n + l.minutes, 0) <= 1440, "Tổng thời gian không được vượt 24 giờ/ngày");
			ensure(new Set(data.lines.map((l) => l.taskId + ":" + l.activity)).size === data.lines.length, "Mỗi task / hoạt động chỉ xuất hiện một dòng trong ngày");
			const all = await this.rows();
			const old = b.id ? await this.get(id.parse(b.id), "daily") : all.find((r) => r.kind === "daily" && r.owner_id === owner.id && r.date === data.date);
			ensure(!old || old.owner_id === owner.id && old.date === data.date, "Không được đổi nhân sự hoặc ngày của báo cáo đang sửa", 409);
			if (old && b.revision != null) ensure(b.revision === old.revision, "Báo cáo đã được người khác cập nhật. Tải lại trước khi sửa tiếp.", 409);
			const status = data.submit || old && [
				"submitted",
				"approved",
				"imported"
			].includes(old.status) ? "submitted" : "draft";
			const reservations = [];
			for (const l of data.lines) {
				const task = await this.get(l.taskId, "task");
				l.taskCode = task.data.code;
				l.jobId = task.data.jobId || "";
				if (l.activity === "qc") {
					ensure(owner.role === "Lead" || owner.role === "QA/QC" && task.data.reviewerId === owner.id, "Chỉ báo cáo QC cho task được giao kiểm tra", 403);
					ensure(l.quantity === 0 && l.rework === 0, "Hoạt động QC chỉ ghi thời gian; sản lượng lấy từ kết quả kiểm tra");
					continue;
				}
				ensure(task.data.assigneeId === owner.id, "Chỉ được báo cáo annotation cho task của nhân sự báo cáo", 403);
				const previous = old?.data.lines?.find((line) => line.taskId === l.taskId && line.activity !== "qc");
				if (!previous || previous.productionPending) {
					const source = all.find((r) => r.kind === "kpi-source" && r.task_id === task.id && r.owner_id === owner.id && r.status === "active");
					if (source && (countedMethod(l.productionMethod) || data.date >= source.data.capturedDate)) l.productionMethod = source.data.production.basis === "datumaro-baseline-v1" ? DATUMARO_METHOD : "keyframe-v1";
				}
				if (l.endId && (!previous || BigInt(l.endId) > BigInt(reportEndId(previous) || "0"))) ensure(!all.some((r) => r.kind === "daily" && r.id !== old?.id && r.owner_id === owner.id && r.date > data.date && [
					"submitted",
					"approved",
					"imported"
				].includes(r.status) && (r.data.lines || []).some((line) => line.taskId === task.id && line.keyframeSnapshot && BigInt(l.endId) >= BigInt(line.keyframeSnapshot.start))), "Mốc ID chồng lên KPI keyframe đã lưu ở ngày sau. Cần đối chiếu lại khoảng ID.", 409);
				if (countedMethod(l.productionMethod)) {
					ensure(all.some((p) => p.kind === "project" && p.id === task.project_id && p.data.unit === "cuboid"), "KPI keyframe chỉ áp dụng cho cuboid");
					if (previous?.productionMethod === l.productionMethod && previous.keyframeSnapshot && reportEndId(previous) === l.endId && (!l.countSourceId || l.countSourceId === previous.countSourceId)) Object.assign(l, {
						quantity: previous.quantity,
						idCount: previous.idCount,
						countSourceId: previous.countSourceId,
						countRunId: previous.countRunId || previous.keyframeSnapshot.runId || void 0,
						keyframeSnapshot: previous.keyframeSnapshot,
						frameCountAtReport: previous.frameCountAtReport
					});
					else {
						ensure(!previous || previous.productionPending && !previous.keyframeSnapshot || previous.productionMethod === l.productionMethod, "Giữ nguyên KPI cũ. Chỉ dùng cách đếm mới cho dòng báo cáo mới.", 409);
						const source = all.find((r) => r.kind === "kpi-source" && r.task_id === task.id && r.owner_id === owner.id && r.status === "active");
						if (source && l.countRunId) ensure(l.countRunId === source.data.runId, "Bảng đếm đã được cập nhật bằng file khác. Làm mới dữ liệu trước khi gửi báo cáo.", 409);
						const range = keyframeRange(all, owner.id, task.id, data.date, l.endId, old?.id, source?.data.production.offset);
						ensure(!range.error, range.error);
						const baseline = l.productionMethod === DATUMARO_METHOD;
						const compatible = source && (baseline ? source.data.production.basis === "datumaro-baseline-v1" : !source.data.production.basis);
						if (source && !l.countSourceId) l.countSourceId = source.id;
						const count = compatible && source.id === l.countSourceId && (baseline || source.data.capturedDate >= data.date) ? keyframeQuantity(source.data.production, range) : null;
						if (!count || count.error) {
							l.quantity = 0;
							l.idCount = null;
							Object.assign(l, {
								productionPending: true,
								productionPendingReason: count?.error || "Chờ file annotation đầy đủ được xác nhận cho ngày báo cáo."
							});
						} else {
							ensure(!all.some((r) => r.kind === "daily" && r.id !== old?.id && r.owner_id === owner.id && r.date > data.date && [
								"submitted",
								"approved",
								"imported"
							].includes(r.status) && (r.data.lines || []).some((line) => line.taskId === task.id && line.activity !== "qc" && Number(reportEndId(line)) < count.end)), "Mốc ID vượt báo cáo ngày sau; cần sửa mốc ngày sau trước.", 409);
							ensure(!all.some((r) => r.kind === "daily" && r.id !== old?.id && r.owner_id === owner.id && [
								"submitted",
								"approved",
								"imported"
							].includes(r.status) && (r.data.lines || []).some((line) => line.taskId === task.id && line.keyframeSnapshot && count.start <= line.keyframeSnapshot.end && count.end >= line.keyframeSnapshot.start)), "Khoảng ID đã được tính KPI ở báo cáo khác.", 409);
							l.quantity = count.quantity;
							l.idCount = count.countedIds;
							l.countRunId = source.data.runId;
							Object.assign(l, {
								frameCountAtReport: taskFrameCount(task),
								keyframeSnapshot: {
									version: baseline ? 2 : 1,
									method: l.productionMethod,
									runId: source.data.runId,
									fileHash: source.data.fileHash,
									sourceId: source.id,
									sourceRevision: source.revision,
									start: count.start,
									end: count.end,
									previousEnd: count.previousEnd,
									previousReportId: count.previousReportId,
									countedIds: count.countedIds,
									visible: count.visible,
									outside: count.outside,
									baseline: count.baseline,
									added: count.added,
									quantity: count.quantity,
									countedAt: this.stamp()
								}
							});
						}
					}
				} else if (countedMethod(previous?.productionMethod)) ensure(false, "Không đổi dòng KPI đã đếm sang công thức cũ", 409);
				else if (l.idCount != null) {
					ensure(all.some((p) => p.kind === "project" && p.id === task.project_id && p.data.unit === "cuboid"), "Công thức ID × frame chỉ áp dụng cho cuboid");
					const previous = old?.data.lines?.find((line) => line.taskId === l.taskId && line.activity !== "qc"), frames = previous?.idCount != null ? previous.frameCountAtReport : taskFrameCount(task);
					ensure(frames != null, "Lead cần nhập số frame của Job trước khi tính cuboid");
					const quantity = cuboidsFromIds(l.idCount, frames);
					ensure(quantity != null, "Số ID hoặc số frame không hợp lệ, hoặc sản lượng vượt giới hạn");
					l.quantity = quantity;
					Object.assign(l, {
						frameCountAtReport: frames,
						productionFactor: PRODUCTION_FACTOR
					});
				}
				ensure(status !== "submitted" || l.endId, "Cần nhập ID đã làm tới cho mỗi dòng annotation");
			}
			const reports = [...all.filter((r) => r.kind === "daily" && r.id !== old?.id), {
				date: data.date,
				data
			}], touched = new Set([...data.lines, ...old?.data.lines || []].filter((l) => l.activity !== "qc").map((l) => l.taskId));
			for (const taskId of touched) {
				const task = await this.get(taskId, "task"), lines = reports.flatMap((r) => (r.data.lines || []).filter((l) => l.taskId === taskId && l.activity !== "qc").map((line) => ({
					date: r.date,
					line
				}))).sort((a, b) => b.date.localeCompare(a.date)), total = lines.reduce((n, v) => n + (v.line.quantity || 0), 0), latest = lines[0];
				ensure(task.data.quantity == null || total <= task.data.quantity, "Tổng sản lượng mới trong báo cáo vượt khối lượng task " + task.data.code);
				reservations.push(this.replace(task, {
					...task.data,
					reportedTotal: total,
					latestProductionDate: latest?.date || null,
					latestEndId: latest ? reportEndId(latest.line) : ""
				}));
			}
			return this.commit(m, m.id !== owner.id ? "Lead viết / sửa Daily Report thay thành viên" : status === "submitted" ? "Gửi / sửa daily report" : "Lưu nháp daily report", old || null, "daily", {
				...data,
				...old?.data.qcActivity ? { qcActivity: old.data.qcActivity } : {},
				qcContentToken: crypto.randomUUID(),
				createdBy: old?.data.createdBy || m.id,
				lastEditedBy: m.id,
				lastEditedAt: this.stamp()
			}, {
				owner_id: owner.id,
				date: data.date,
				natural_key: owner.id + ":" + data.date,
				status
			}, reservations);
		}
		if (action === "weekly") {
			const data = weeklySchema.parse(b);
			data.date = weekStart(data.date);
			ensure(data.date <= today(this.now), "Không gửi báo cáo tuần tương lai");
			const old = (await this.rows("weekly")).find((r) => r.owner_id === m.id && r.date === data.date);
			ensure(!old || ["draft", "changes"].includes(old.status), "Báo cáo cần Lead mở lại trước khi sửa", 409);
			const aggregate = await this.aggregate(m, m.id, data.date);
			return this.commit(m, data.submit ? "Gửi weekly report" : "Lưu nháp weekly report", old || null, "weekly", {
				...data,
				snapshot: data.submit ? aggregate : null,
				aggregatedAt: data.submit ? this.stamp() : null
			}, {
				owner_id: m.id,
				date: data.date,
				natural_key: m.id + ":" + data.date,
				status: data.submit ? "submitted" : "draft"
			});
		}
		if (action === "report-decision") {
			this.lead(m);
			const row = await this.get(id.parse(b.id));
			ensure(["daily", "weekly"].includes(row.kind), "Loại báo cáo không hợp lệ");
			const decision = enumType([
				"approve",
				"changes",
				"reopen"
			]).parse(b.decision);
			const reason = decision === "approve" ? str.parse(b.reason || "") : required.parse(b.reason);
			ensure(decision === "reopen" ? ["approved", "submitted"].includes(row.status) : row.status === "submitted", "Trạng thái báo cáo không phù hợp", 409);
			return this.commit(m, "Duyệt / mở lại báo cáo", row, row.kind, {
				...row.data,
				...row.kind === "daily" ? {
					autoQcApproved: false,
					...decision !== "approve" ? {
						qcContentToken: crypto.randomUUID(),
						qcBaseRevision: void 0
					} : {}
				} : {},
				reviewReason: reason,
				reviewedBy: m.id,
				reviewedAt: this.stamp()
			}, { status: decision === "approve" ? "approved" : "changes" }, [this.notify(row.owner_id, decision === "approve" ? "Báo cáo đã duyệt" : "Báo cáo cần bổ sung", reason || row.date, row.kind)]);
		}
		if (action === "review-fix") {
			const data = objectType({
				id,
				errorIndex: coerce.number().int().min(0),
				fixed: booleanType(),
				note: str.default("")
			}).parse(b);
			const review = await this.get(data.id, "review"), task = await this.get(review.task_id, "task");
			ensure(task.data.assigneeId === m.id || m.role === "Lead", "Chỉ annotator được giao bài hoặc Lead được cập nhật sửa lỗi", 403);
			ensure(review.data.errors[data.errorIndex], "Không tìm thấy lỗi", 404);
			if (review.data.mode === "daily") ensure(!review.data.errors[data.errorIndex].verification, "Lỗi đã được QC kiểm lại; xem kết quả hoặc lỗi được ghi tiếp", 409);
			else {
				ensure(["changes", "doing"].includes(task.status), "Bài không ở trạng thái sửa lỗi", 409);
				const latest = (await this.rows("review")).filter((r) => r.task_id === task.id && r.data.mode !== "daily").sort((a, b) => b.data.round - a.data.round)[0];
				ensure(latest?.id === review.id, "Chỉ cập nhật lỗi của lượt QC mới nhất", 409);
			}
			const errors = review.data.errors.map((e, i) => i === data.errorIndex ? {
				...e,
				fixed: data.fixed,
				fixNote: data.note,
				fixedBy: m.id,
				fixedAt: data.fixed ? this.stamp() : null
			} : e);
			const value = {
				...review.data,
				errors,
				repairStatus: errors.every((e) => e.fixed) ? "fixed" : "pending"
			};
			const approvals = review.data.mode === "daily" ? reportQcApprovalStatements(this, m, await this.rows(), [{
				...review,
				data: value
			}]) : [];
			return this.commit(m, "Cập nhật trạng thái sửa lỗi", review, "review", value, {}, [this.replace(task, task.data), ...approvals]);
		}
		if (action === "review") {
			const data = reviewSchema.parse(b);
			const task = await this.get(data.taskId, "task");
			data.productionDate ||= today(this.now);
			ensure(data.productionDate <= today(this.now), "Ngày sản lượng không được ở tương lai");
			ensure(m.role === "Lead" || m.role === "QA/QC" && task.data.reviewerId === m.id, "Chỉ QA/QC được phân công hoặc Lead được kiểm tra", 403);
			ensure(["qa", "recheck"].includes(task.status), "Task chưa sẵn sàng kiểm tra hoặc đã xử lý", 409);
			ensure(data.checked === data.passed + data.failed && data.checked <= task.data.completed, "Số đạt + cần sửa phải bằng số đã kiểm và không vượt tiến độ task");
			ensure(data.scope !== "sample" || data.sample.trim(), "Cần mô tả phạm vi mẫu");
			ensure(data.scope !== "full" || data.checked === task.data.completed, "Kiểm toàn bộ phải bằng khối lượng task đã làm");
			ensure(data.verdict !== "passed" || data.failed === 0 && task.data.completed === task.data.quantity, "Chỉ hoàn thành khi không còn lỗi và đã làm đủ khối lượng giao");
			ensure(data.verdict !== "changes" || data.failed > 0 && data.errors.length > 0, "Cần ghi số lượng và chi tiết lỗi khi trả sửa");
			const settings = await this.settings();
			ensure(data.errors.every((e) => settings.errorTypes.includes(e.type)), "Loại lỗi không nằm trong danh mục");
			const reviews = (await this.rows("review")).filter((r) => r.task_id === task.id);
			return this.commit(m, "Ghi nhận kết quả QA/QC", null, "review", {
				...data,
				round: reviews.length + 1,
				first: !reviews.some((r) => r.data.mode !== "daily"),
				fixerId: task.data.assigneeId,
				checkedAt: this.stamp()
			}, {
				owner_id: m.id,
				task_id: task.id,
				project_id: task.project_id,
				date: today(this.now),
				status: data.verdict
			}, [this.replace(task, {
				...task.data,
				completedAt: data.verdict === "passed" ? this.stamp() : null
			}, data.verdict === "passed" ? "done" : "changes"), this.notify(task.data.assigneeId, data.verdict === "passed" ? "Task đã hoàn thành" : "Task cần sửa lỗi", task.data.code + " · " + data.note, "tasks")]);
		}
		if (action === "document") {
			this.lead(m);
			const data = objectType({
				title: required,
				content: str,
				link: url.default(""),
				category: enumType(["announcement", "guide"])
			}).parse(b);
			return this.commit(m, "Lưu thông báo / tài liệu", b.id ? await this.get(b.id, "document") : null, "document", data, { owner_id: m.id });
		}
		if (action === "settings") {
			this.lead(m);
			const time = stringType().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
			const data = objectType({
				workStart: time,
				workEnd: time,
				lateGrace: coerce.number().int().min(0).max(120),
				reportDeadline: time,
				workDays: arrayType(numberType().int().min(0).max(6)).min(1),
				kpiStartDate: date$1.default("2026-10-20"),
				kpiWorkingSaturday: date$1.refine((v) => (/* @__PURE__ */ new Date(v + "T12:00:00Z")).getUTCDay() === 6, "Chọn một thứ Bảy làm việc").default("2026-10-24"),
				errorTypes: arrayType(required).min(1).max(30)
			}).parse(b);
			ensure(data.workEnd > data.workStart, "Giờ kết thúc phải sau giờ bắt đầu");
			const row = await this.get("settings");
			return this.commit(m, "Cập nhật cài đặt", row, "settings", {
				...row.data,
				...data
			});
		}
		if (action === "target") {
			this.lead(m);
			const data = objectType({
				memberId: id,
				projectId: id,
				from: date$1,
				to: date$1,
				quantity: num.positive()
			}).parse(b);
			ensure(data.to >= data.from, "Khoảng ngày không hợp lệ");
			await this.get(data.projectId, "project");
			ensure((await this.members()).some((x) => x.id === data.memberId), "Thành viên không tồn tại");
			return this.commit(m, "Thiết lập chỉ tiêu", b.id ? await this.get(b.id, "target") : null, "target", data, {
				owner_id: data.memberId,
				project_id: data.projectId,
				date: data.from
			});
		}
		if (action === "notification-read") {
			const row = await this.get(id.parse(b.id), "notification");
			ensure(row.owner_id === m.id, "Không có quyền", 403);
			await this.db.batch([this.replace(row, {
				...row.data,
				read: true
			})]);
			return { ok: true };
		}
		if (action === "kpi-exclusion") {
			this.attendanceLead(m);
			const data = objectType({
				date: date$1,
				memberId: id.nullable().default(null),
				reason: str.default(""),
				enabled: booleanType().default(true)
			}).parse(b);
			ensure(!data.memberId || (await this.members()).some((m) => m.id === data.memberId), "Thành viên không tồn tại");
			const key = (data.memberId || "team") + ":" + data.date, old = (await this.rows("kpi-exclusion")).find((r) => r.natural_key === key);
			return this.commit(m, data.enabled ? "Không tính KPI trong ngày" : "Tính lại KPI trong ngày", old || null, "kpi-exclusion", data, {
				owner_id: data.memberId,
				date: data.date,
				natural_key: key,
				status: data.enabled ? "active" : "disabled"
			});
		}
		if (action === "kpi-rate") {
			this.attendanceLead(m);
			const data = objectType({
				memberId: id,
				date: date$1,
				quantity: num.int(),
				reason: str.default("")
			}).parse(b);
			ensure((await this.members()).some((m) => m.id === data.memberId), "Thành viên không tồn tại");
			const key = data.memberId + ":" + data.date, old = (await this.rows("kpi-rate")).find((r) => r.natural_key === key);
			return this.commit(m, "Điều chỉnh mức KPI theo người", old || null, "kpi-rate", data, {
				owner_id: data.memberId,
				date: data.date,
				natural_key: key,
				status: "active"
			});
		}
		throw new HubError("Thao tác không tồn tại", 404);
	}
	validateTimes(checkIn, checkOut, day) {
		const start = Date.parse(checkIn), end = Date.parse(checkOut);
		ensure(checkIn && !isNaN(start), "Giờ check-in không hợp lệ");
		ensure(today(new Date(start)) === day && start <= this.now.getTime(), "Giờ check-in phải thuộc ngày điều chỉnh và không ở tương lai");
		ensure(!checkOut || !isNaN(end) && end > start && end <= this.now.getTime() && today(new Date(end)) === day, "Giờ check-out không hợp lệ");
	}
	async evaluation(m, input = {}) {
		this.lead(m);
		const settings = await this.settings(), end = today(this.now);
		const data = objectType({
			from: date$1.default((settings.kpiStartDate || end) > end ? end : settings.kpiStartDate || end),
			to: date$1.default(end),
			member: stringType().max(100).default(""),
			role: enumType([
				"",
				"Lead",
				"QA/QC",
				"Annotator"
			]).default(""),
			state: enumType([
				"",
				"active",
				"pending",
				"invited",
				"disabled"
			]).default(""),
			q: stringType().max(500).default("")
		}).parse(input);
		ensure(data.from <= data.to && data.to <= end, "Chọn khoảng ngày hợp lệ, không vượt ngày hiện tại");
		const members = await this.members();
		ensure(!data.member || members.some((m) => m.id === data.member), "Không tìm thấy nhân sự", 404);
		const q = data.q.trim().toLocaleLowerCase("vi"), rows = buildTeamEvaluation(members, await this.rows(), data.from, data.to).filter((r) => (!data.member || r.memberId === data.member) && (!data.role || r.role === data.role) && (!data.state || r.state === data.state) && (!q || (r.name + " " + r.username).toLocaleLowerCase("vi").includes(q)));
		return {
			from: data.from,
			to: data.to,
			rows,
			totals: evaluationTotals(rows)
		};
	}
	async weeklySummary(m, owner, start) {
		ensure(m.role === "Lead" || owner === m.id, "Chỉ Lead được xem Weekly Report của team hoặc người khác", 403);
		start = weekStart(date$1.parse(start));
		ensure(start <= today(this.now), "Không tổng hợp tuần tương lai");
		const members = await this.members();
		ensure(owner === "team" || members.some((member) => member.id === owner), "Không tìm thấy nhân sự", 404);
		return buildWeeklySummary(members, await this.rows(), start, today(this.now), owner);
	}
	async aggregate(m, owner, start) {
		if (owner === "team") {
			this.lead(m);
			const members = await this.members();
			const summaries = [];
			for (const member of members) summaries.push({
				memberId: member.id,
				name: member.name,
				role: member.role,
				...await this.aggregate(m, member.id, start)
			});
			const products = {}, firstPass = {};
			for (const summary of summaries) {
				for (const p of summary.products) {
					const v = products[p.projectId] ||= {
						...p,
						quantity: 0,
						rework: 0,
						minutes: 0,
						missingReworkLines: 0
					};
					v.missingReworkLines += p.missingReworkLines || 0;
					v.quantity += p.quantity;
					v.rework += p.rework;
					v.minutes += p.minutes;
				}
				for (const [key, p] of Object.entries(summary.firstPass)) {
					const v = firstPass[key] ||= {
						unit: p.unit,
						checked: 0,
						passed: 0
					};
					v.checked += p.checked;
					v.passed += p.passed;
				}
			}
			return {
				start: weekStart(start),
				end: addDays(weekStart(start), 6),
				minutes: summaries.reduce((n, s) => n + s.minutes, 0),
				annotationMinutes: summaries.reduce((n, s) => n + s.annotationMinutes, 0),
				qcMinutes: summaries.reduce((n, s) => n + s.qcMinutes, 0),
				missingTimeLines: summaries.reduce((n, s) => n + s.missingTimeLines, 0),
				knownTimeLines: summaries.reduce((n, s) => n + s.knownTimeLines, 0),
				products: Object.values(products),
				firstPass,
				tasks: {
					completed: summaries.reduce((n, s) => n + s.tasks.completed, 0),
					open: summaries.reduce((n, s) => n + s.tasks.open, 0),
					overdue: summaries.reduce((n, s) => n + s.tasks.overdue, 0)
				},
				sourceReports: summaries.flatMap((s) => s.sourceReports),
				sourceTasks: summaries.flatMap((s) => s.sourceTasks),
				sourceReviews: summaries.flatMap((s) => s.sourceReviews),
				attendance: summaries.flatMap((s) => s.attendance),
				errors: summaries.flatMap((s) => s.errors),
				members: summaries
			};
		}
		ensure(m.role === "Lead" || owner === m.id, "Không có quyền xem tổng hợp người khác", 403);
		start = weekStart(date$1.parse(start));
		const end = addDays(start, 6);
		const all = await this.rows();
		const reports = all.filter((r) => r.kind === "daily" && r.owner_id === owner && r.date >= start && r.date <= end && [
			"submitted",
			"approved",
			"imported"
		].includes(r.status));
		const tasks = all.filter((r) => r.kind === "task" && r.data.assigneeId === owner && r.data.assignedDate <= end && (r.updated_at.slice(0, 10) >= start || r.status !== "done"));
		const products = {};
		for (const report of reports) for (const l of report.data.lines) {
			const t = all.find((r) => r.id === l.taskId);
			const p = all.find((r) => r.id === t?.project_id);
			if (!p) continue;
			const v = products[p.id] ||= {
				projectId: p.id,
				project: p.data.name,
				unit: p.data.unit,
				quantity: 0,
				rework: 0,
				minutes: 0,
				missingReworkLines: 0
			};
			if (l.rework == null) v.missingReworkLines++;
			v.quantity += l.quantity;
			v.rework += l.rework;
			v.minutes += l.minutes;
		}
		const taskIds = new Set(all.filter((r) => r.kind === "task" && r.data.assigneeId === owner).map((t) => t.id));
		const reviews = all.filter((r) => r.kind === "review" && taskIds.has(r.task_id) && r.date >= start && r.date <= end);
		const first = {};
		for (const r of reviews.filter((r) => r.data.first)) {
			const p = all.find((p) => p.id === r.project_id);
			if (p) {
				const v = first[p.id] ||= {
					unit: p.data.unit,
					checked: 0,
					passed: 0
				};
				v.checked += r.data.checked;
				v.passed += r.data.passed;
			}
		}
		const lines = reports.flatMap((r) => r.data.lines);
		return {
			start,
			end,
			minutes: lines.reduce((n, l) => n + (l.minutes || 0), 0),
			annotationMinutes: lines.filter((l) => l.activity !== "qc").reduce((n, l) => n + (l.minutes || 0), 0),
			qcMinutes: lines.filter((l) => l.activity === "qc").reduce((n, l) => n + (l.minutes || 0), 0),
			missingTimeLines: lines.filter((l) => l.minutes == null).length,
			knownTimeLines: lines.filter((l) => l.minutes != null).length,
			products: Object.values(products),
			tasks: {
				completed: tasks.filter((t) => t.status === "done" && t.data.completedAt && today(new Date(t.data.completedAt)) >= start && today(new Date(t.data.completedAt)) <= end).length,
				open: tasks.filter((t) => t.status !== "done").length,
				overdue: tasks.filter((t) => t.status !== "done" && t.data.deadline && t.data.deadline < (end < today(this.now) ? end : today(this.now))).length
			},
			firstPass: first,
			errors: reviews.flatMap((r) => r.data.errors),
			attendance: all.filter((r) => r.kind === "attendance" && r.owner_id === owner && r.date >= start && r.date <= end).map((r) => ({
				date: r.date,
				status: r.status
			})),
			sourceReports: reports.map((r) => ({
				id: r.id,
				date: r.date,
				status: r.status,
				revision: r.revision
			})),
			sourceTasks: tasks.map((r) => ({
				id: r.id,
				code: r.data.code,
				status: r.status,
				revision: r.revision
			})),
			sourceReviews: reviews.map((r) => r.id),
			formula: "Tỷ lệ đạt lần đầu = số đơn vị đạt ở lần kiểm đầu / số đơn vị đã kiểm lần đầu. Tính riêng từng dự án, không trộn đơn vị."
		};
	}
};
//#endregion
//#region lib/export.ts
var esc = (v) => String(v ?? "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").replace(/[<>&"']/g, (s) => ({
	"<": "&lt;",
	">": "&gt;",
	"&": "&amp;",
	"\"": "&quot;",
	"'": "&apos;"
})[s]);
var plain = (v) => v instanceof Date ? v.toISOString().slice(0, 10).split("-").reverse().join("/") : v && typeof v === "object" && ("formula" in v || v.format === "percent") ? v.value : v ?? "";
function csv(rows) {
	return "﻿" + rows.map((r) => r.map((v) => "\"" + String(plain(v)).replace(/^[=+@-]/, "'$&").replace(/"/g, "\"\"") + "\"").join(",")).join("\r\n");
}
function crc32(b) {
	let c = -1;
	for (const n of b) {
		c ^= n;
		for (let j = 0; j < 8; j++) c = c >>> 1 ^ (c & 1 ? 3988292384 : 0);
	}
	return (c ^ -1) >>> 0;
}
function zip(files) {
	const enc = new TextEncoder();
	const chunks = [];
	const directory = [];
	let offset = 0;
	for (const [name, value] of Object.entries(files)) {
		const n = enc.encode(name), b = enc.encode(value), crc = crc32(b);
		const local = new Uint8Array(30 + n.length);
		const v = new DataView(local.buffer);
		v.setUint32(0, 67324752, true);
		v.setUint16(4, 20, true);
		v.setUint16(6, 2048, true);
		v.setUint32(14, crc, true);
		v.setUint32(18, b.length, true);
		v.setUint32(22, b.length, true);
		v.setUint16(26, n.length, true);
		local.set(n, 30);
		const central = new Uint8Array(46 + n.length);
		const d = new DataView(central.buffer);
		d.setUint32(0, 33639248, true);
		d.setUint16(4, 20, true);
		d.setUint16(6, 20, true);
		d.setUint16(8, 2048, true);
		d.setUint32(16, crc, true);
		d.setUint32(20, b.length, true);
		d.setUint32(24, b.length, true);
		d.setUint16(28, n.length, true);
		d.setUint32(42, offset, true);
		central.set(n, 46);
		chunks.push(local, b);
		directory.push(central);
		offset += local.length + b.length;
	}
	const size = directory.reduce((n, b) => n + b.length, 0);
	const end = new Uint8Array(22);
	const v = new DataView(end.buffer);
	v.setUint32(0, 101010256, true);
	v.setUint16(8, directory.length, true);
	v.setUint16(10, directory.length, true);
	v.setUint32(12, size, true);
	v.setUint32(16, offset, true);
	const out = new Uint8Array(offset + size + end.length);
	let pos = 0;
	for (const b of [
		...chunks,
		...directory,
		end
	]) {
		out.set(b, pos);
		pos += b.length;
	}
	return out;
}
function xlsx(input) {
	const cell = (n) => {
		let s = "";
		for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
		return s;
	};
	const sheets = Array.isArray(input[0]) ? [{
		name: "Cuboid Team Hub",
		rows: input
	}] : input;
	if (!sheets.length) sheets.push({
		name: "Bao cao",
		rows: [["Chưa có dữ liệu"]]
	});
	const matrixFills = [
		"E2EFDA",
		"FFE699",
		"F4B084",
		"E9EDF3"
	];
	const totalXfs = [
		0,
		164,
		166,
		167
	].map((format) => `<xf numFmtId="${format}" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"${format ? " horizontal=\"right\"" : ""}/></xf>`).join("");
	const matrixXfs = [
		[3, 0],
		[4, 0],
		[5, 0],
		[6, 0],
		[4, 2],
		[5, 2],
		[4, 3],
		[5, 3]
	].map(([fill, border]) => `<xf numFmtId="0" fontId="0" fillId="${fill}" borderId="${border}" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`).join("");
	const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>", main = "http://schemas.openxmlformats.org/spreadsheetml/2006/main", rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
	const files = {
		"[Content_Types].xml": xml + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" + sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/tables/table${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"/>`).join("") + "</Types>",
		"_rels/.rels": "<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>",
		"xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets>` + sheets.map((s, i) => `<sheet name="${esc(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"${s.hidden ? " state=\"veryHidden\"" : ""}/>`).join("") + "</sheets><definedNames>" + sheets.map((s, i) => `<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${esc(s.name.replace(/'/g, "''"))}'!$1:$1</definedName>`).join("") + "</definedNames><calcPr calcId=\"191029\" fullCalcOnLoad=\"1\"/></workbook>",
		"xl/_rels/workbook.xml.rels": xml + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" + sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") + `<Relationship Id="rIdStyles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
		"xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${main}"><numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="#,##0.00"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF24354D"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF18754D"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFAC5426"/><name val="Calibri"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF233F68"/><bgColor indexed="64"/></patternFill></fill>${matrixFills.map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills><borders count="4"><border/><border><bottom style="hair"><color rgb="FFDFE6EE"/></bottom></border>${["C03939", "3675C5"].map((c) => `<border>${[
			"left",
			"right",
			"top",
			"bottom"
		].map((edge) => `<${edge} style="thin"><color rgb="FF${c}"/></${edge}>`).join("")}</border>`).join("")}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="20"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf>${matrixXfs}${totalXfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`
	};
	sheets.forEach((s, k) => {
		const rows = s.rows.length ? s.rows : [["Chưa có dữ liệu"]], columns = rows[0].map((v, i) => String(v || "Cột " + (i + 1))), end = `${cell(columns.length - 1)}${rows.length}`, tableEnd = `${cell(columns.length - 1)}${rows.length - (s.totalRow ? 1 : 0)}`, widths = s.widths || columns.map((h, j) => Math.min(55, Math.max(12, h.length + 3, ...rows.slice(1, 151).map((r) => Math.min(48, String(plain(r[j])).split("\n")[0].length + 2)))));
		const body = rows.map((r, i) => `<row r="${i + 1}" ht="${i === 0 ? 36 : Math.min(s.maxRowHeight || 240, Math.max(25, ...r.map((v, j) => String(plain(v)).split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / (widths[j] || 20))), 0) * 15)))}" customHeight="1">` + columns.map((_, j) => {
			let v = r[j];
			const ref = `${cell(j)}${i + 1}`;
			let style = i === 0 ? 1 : v instanceof Date ? 3 : typeof v === "number" ? Number.isInteger(v) ? 2 : 7 : ["Đạt", "Đã sửa"].includes(v) ? 5 : ["Chưa đạt", "Chưa sửa"].includes(v) ? 6 : 0;
			const isTotal = !!s.totalRow && i === rows.length - 1;
			if (isTotal) style = typeof v === "number" ? Number.isInteger(v) ? 17 : 19 : 16;
			if (v && typeof v === "object" && v.format === "percent" && !("formula" in v)) {
				style = isTotal ? 18 : 4;
				v = v.value;
			}
			if (i > 0 && s.matrixStyle) style = s.matrixStyle(i - 1, j) ?? style;
			if (v && typeof v === "object" && "formula" in v) {
				style = isTotal ? v.format === "percent" ? 18 : typeof v.value === "number" ? Number.isInteger(v.value) ? 17 : 19 : 16 : v.format === "percent" ? 4 : typeof v.value === "number" ? Number.isInteger(v.value) ? 2 : 7 : 0;
				return `<c r="${ref}" s="${style}"${typeof v.value === "string" ? " t=\"str\"" : ""}><f>${esc(v.formula)}</f><v>${esc(v.value)}</v></c>`;
			}
			if (v instanceof Date) return `<c r="${ref}" s="${style}"><v>${v.getTime() / 864e5 + 25569}</v></c>`;
			return typeof v === "number" && Number.isFinite(v) ? `<c r="${ref}" s="${style}"><v>${v}</v></c>` : `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v ?? "").slice(0, 32767))}</t></is></c>`;
		}).join("") + "</row>").join("");
		files[`xl/worksheets/sheet${k + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${main}" xmlns:r="${rel}"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${end}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ${s.freezeColumns ? `xSplit="${s.freezeColumns}" ` : ""}ySplit="1" topLeftCell="${s.freezeColumns ? cell(s.freezeColumns) : "A"}2" activePane="${s.freezeColumns ? "bottomRight" : "bottomLeft"}" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="25"/><cols>` + widths.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join("") + `</cols><sheetData>${body}</sheetData>${s.matrixStyle ? `<autoFilter ref="A1:${end}"/>` : ""}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="${s.matrixStyle ? 0 : 1}" fitToHeight="0"/>${s.matrixStyle ? "" : "<tableParts count=\"1\"><tablePart r:id=\"rIdTable\"/></tableParts>"}</worksheet>`;
		files[`xl/worksheets/_rels/sheet${k + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTable" Type="${rel}/table" Target="../tables/table${k + 1}.xml"/></Relationships>`;
		files[`xl/tables/table${k + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><table xmlns="${main}" id="${k + 1}" name="CuboidTable${k + 1}" displayName="CuboidTable${k + 1}" ref="A1:${tableEnd}" totalsRowShown="0"><autoFilter ref="A1:${tableEnd}"/><tableColumns count="${columns.length}">` + columns.map((h, j) => `<tableColumn id="${j + 1}" name="${esc(h)}"/>`).join("") + `</tableColumns><tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" showRowStripes="1" showColumnStripes="0"/></table>`;
	});
	return zip(files);
}
//#endregion
//#region lib/qc-matrix.ts
var order = "SKZHOD!L";
function matrixCodes(codes) {
	return [...new Set(codes)].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join("");
}
function qcFrameRange(log) {
	return log.frameEnd && log.frameEnd !== log.frameId ? `${log.frameId}–${log.frameEnd}` : log.frameId || "—";
}
function inFrameRange(log, frame) {
	return /^\d+$/.test(log.frameId || "") && /^\d+$/.test(String(frame)) && BigInt(frame) >= BigInt(log.frameId) && BigInt(frame) <= BigInt(log.frameEnd || log.frameId);
}
function rowFrameLogs(row) {
	if (row.frameLogs !== void 0) return row.frameLogs;
	return row.result === "changes" ? [{
		id: "legacy-" + row.objectId,
		frameId: row.frameId,
		frameEnd: "",
		type: row.type,
		severity: row.severity,
		description: row.description,
		evidence: row.evidence,
		code: "L"
	}] : [];
}
function matrixPage(presence, warnings, query) {
	const integer = (key, fallback, max) => {
		const n = Number(query.get(key) || fallback);
		return Number.isSafeInteger(n) && n > 0 ? Math.min(n, max) : fallback;
	};
	const search = (query.get("q") || "").trim().toLowerCase(), check = query.get("check") || "", onlyIssues = query.get("issuesOnly") === "1", ids = query.get("ids"), wanted = ids ? new Set(ids.split(",").map(qcIdKey)) : null;
	if (wanted && (wanted.size > 50 || [...wanted].some((id) => !/^\d{1,30}$/.test(id)))) throw new Error("Chỉ chọn tối đa 50 Object ID hợp lệ mỗi trang.");
	const byTrack = /* @__PURE__ */ new Map();
	for (const issue of warnings) {
		if (issue.track === null || issue.track === void 0 || issue.track === "") continue;
		const id = qcIdKey(String(issue.track));
		if (!byTrack.has(id)) byTrack.set(id, []);
		byTrack.get(id).push(issue);
	}
	const rows = [...presence.tracks].sort((a, b) => /^\d+$/.test(a.id) && /^\d+$/.test(b.id) ? BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0 : a.id.localeCompare(b.id)).filter((r) => (!wanted || wanted.has(qcIdKey(r.id))) && (!search || (r.id + " " + r.label).toLowerCase().includes(search)) && (!onlyIssues || (byTrack.get(qcIdKey(r.id)) || []).length > 0) && (!check || (byTrack.get(qcIdKey(r.id)) || []).some((i) => i.check === check)));
	const pages = Math.max(1, Math.ceil(rows.length / 50)), page = Math.min(integer("page", 1, 1e4), pages), framePages = Math.max(1, Math.ceil(presence.frames.length / 60)), framePage = Math.min(integer("framePage", 1, 1e4), framePages), shownFrames = presence.frames.slice((framePage - 1) * 60, framePage * 60), frameSet = new Set(shownFrames);
	return {
		version: 1,
		frames: presence.frames,
		shownFrames,
		framePage,
		framePages,
		page,
		pages,
		total: rows.length,
		rows: (wanted ? rows : rows.slice((page - 1) * 50, page * 50)).map((r) => {
			const issues = byTrack.get(qcIdKey(r.id)) || [], cells = /* @__PURE__ */ new Map();
			for (const issue of issues) if (frameSet.has(issue.frame)) {
				if (!cells.has(issue.frame)) cells.set(issue.frame, []);
				cells.get(issue.frame).push(issue);
			}
			return {
				id: r.id,
				label: r.label,
				present: r.present.filter((f) => frameSet.has(f)),
				total: issues.length,
				cells: [...cells].map(([frame, list]) => ({
					frame,
					codes: matrixCodes(list.map((i) => BASIC_CHECKS.find((c) => c.key === i.check)?.code || i.code || "!")),
					count: list.length
				}))
			};
		})
	};
}
//#endregion
//#region lib/qc-export.ts
function qcSessionSheets(sessions, records, members) {
	const name = (id) => members.find((m) => m.id === id)?.name || "", date = (s) => s ? /* @__PURE__ */ new Date(s + "T00:00:00Z") : null, time = (s) => s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "", status = (s) => ({
		assigned: "Chưa bắt đầu",
		in_progress: "Đang QC",
		completed: "Đã ghi kết quả",
		superseded: "Đã nối vào phân công Job"
	})[s] || s;
	const ids = new Set(sessions.map((s) => s.id)), reviews = records.filter((r) => r.kind === "review" && ids.has(r.data.sessionId));
	return [
		{
			name: "Phan cong va tien do QC",
			rows: [[
				"Ngày được giao QC",
				"Ngày sản lượng",
				"Task ID",
				"Job ID",
				"Số frame của Job",
				"Annotator",
				"Người QA/QC được giao",
				"Người phân công",
				"Lúc phân công (UTC+7)",
				"Trạng thái",
				"Người bắt đầu",
				"Bắt đầu (UTC+7)",
				"Người hoàn tất",
				"Hoàn tất (UTC+7)",
				"ID bắt đầu",
				"ID cuối đã chốt",
				"Lần QC trước tới ID",
				"ID cuối theo báo cáo",
				"Cuboid theo báo cáo",
				"Lỗi mới",
				"Lỗi cũ vẫn sai",
				"Lỗi cũ đã kiểm lại",
				"Tổng lỗi trong log",
				"Nguồn bổ sung ID",
				"Ghi chú phân công",
				"Kết quả / nhận xét"
			], ...sessions.map((s) => [
				date(s.date),
				date(s.data.productionDate),
				s.data.taskCode,
				s.data.jobId,
				s.data.frameCount ?? null,
				name(s.data.assigneeId),
				name(s.data.reviewerId),
				name(s.data.assignedBy),
				time(s.data.assignedAt),
				status(s.status),
				name(s.data.startedBy),
				time(s.data.startedAt),
				name(s.data.completedBy),
				time(s.data.completedAt),
				s.data.rangeStart,
				s.data.endId,
				s.data.previousEndId,
				s.data.reportedEndId,
				s.data.quantity,
				s.data.newErrorCount ?? null,
				s.data.repeatedErrorCount ?? null,
				s.data.recheckedCount ?? null,
				s.data.errorCount ?? null,
				s.data.endIdNote,
				s.data.assignmentNote,
				s.data.note
			])]
		},
		{
			name: "Log loi va xac nhan sua",
			rows: [[
				"Ngày QC",
				"Ngày sản lượng",
				"Task ID",
				"Job ID",
				"Annotator",
				"Người QC",
				"STT lỗi",
				"Object ID",
				"Frame ID",
				"Loại lỗi",
				"Mức độ",
				"Mô tả",
				"Lỗi cũ vẫn sai",
				"Log lỗi gốc",
				"Minh chứng",
				"Annotator xác nhận sửa",
				"Người sửa",
				"Lúc sửa (UTC+7)",
				"Ghi chú sửa",
				"QC xác minh lại",
				"Người xác minh",
				"Lúc xác minh (UTC+7)"
			], ...reviews.flatMap((r) => (r.data.errors || []).map((e, i) => [
				date(r.date),
				date(r.data.productionDate),
				r.data.taskCode,
				r.data.jobId,
				name(r.data.fixerId),
				name(r.owner_id),
				i + 1,
				e.objectId,
				qcFrameRange(e),
				e.type,
				{
					minor: "Nhẹ",
					major: "Nặng",
					critical: "Nghiêm trọng"
				}[e.severity],
				e.description,
				e.repeated ? "Có" : "Không",
				e.originReviewId ? e.originReviewId + " · lỗi " + (e.originErrorIndex + 1) : "",
				e.evidence,
				e.fixed ? "Đã xác nhận" : "Chưa xác nhận",
				name(e.fixedBy),
				time(e.fixedAt),
				e.fixNote,
				e.verification === "passed" ? "Sửa đúng" : e.verification === "failed" ? "Vẫn sai · đã ghi tiếp" : "Chưa xác minh",
				name(e.verifiedBy),
				time(e.verifiedAt)
			]))]
		},
		{
			name: "Kiem lai loi cu",
			rows: [[
				"Ngày QC kiểm lại",
				"Task ID",
				"Job ID",
				"Annotator",
				"Người QC",
				"Log lỗi cũ",
				"STT lỗi cũ",
				"Mô tả lỗi cũ",
				"Kết quả",
				"Ghi chú"
			], ...reviews.flatMap((r) => (r.data.rechecks || []).map((c) => [
				date(r.date),
				r.data.taskCode,
				r.data.jobId,
				name(r.data.fixerId),
				name(r.owner_id),
				c.reviewId,
				c.errorIndex + 1,
				records.find((v) => v.id === c.reviewId)?.data.errors?.[c.errorIndex]?.description || "",
				c.result === "passed" ? "Sửa đúng" : "Vẫn sai · đã ghi tiếp",
				c.note || ""
			]))]
		},
		{
			name: "QC tung ID",
			rows: [[
				"Ngày QC",
				"Ngày sản lượng",
				"Task ID",
				"Job ID",
				"Annotator",
				"Người QC",
				"Object ID",
				"Kết quả QC",
				"Frame ID",
				"Log lỗi / ghi chú",
				"Annotator sửa",
				"Ghi chú sửa",
				"QC xác minh lại",
				"Ghi kết quả (UTC+7)"
			], ...reviews.flatMap((r) => qcLogRows(r.data).map((row) => {
				const errors = row.errors.map((e) => e.error);
				return [
					date(r.date),
					date(r.data.productionDate),
					r.data.taskCode,
					r.data.jobId,
					name(r.data.fixerId),
					name(r.owner_id),
					row.objectId,
					errors.length ? "Có lỗi" : "Đạt",
					errors.length ? [...new Set(errors.map((e) => qcFrameRange(e)).filter((v) => v !== "—"))].join(", ") : row.check?.frameId || "",
					errors.length ? errors.map((e) => e.type + ": " + e.description).join("\n") : row.check?.description || "",
					errors.length ? errors.every((e) => e.fixed) ? "Đã sửa" : "Chưa sửa hết" : "",
					errors.map((e) => e.fixNote).filter(Boolean).join("\n"),
					errors.map((e) => e.verification === "passed" ? "Sửa đúng" : e.verification === "failed" ? "Vẫn sai · đã ghi tiếp" : "Chưa xác minh").join("\n"),
					time(r.data.checkedAt)
				];
			}))]
		},
		{
			name: "Cach tinh",
			rows: [
				["Nội dung", "Quy tắc"],
				["Bảng từng ID", "Mỗi dòng là một Object ID đã kiểm: Đạt hoặc Có lỗi. Nháp chưa phải kết quả QC. Log cũ chỉ có những ID ghi lỗi; không tự suy ra các ID còn lại đạt."],
				["Rework", "Mỗi người mỗi ngày QC có lỗi cộng 1, dù nhiều lỗi, nhiều Job hoặc nhiều lượt trong ngày. Ngày sau lỗi cũ vẫn sai thì cộng 1 cho ngày sau. Tính theo ngày ghi kết quả QC (UTC+7)."],
				["Tiến độ QC", "Bắt đầu và hoàn tất lấy từ các thao tác thực tế trong hệ thống; không suy ra từ trạng thái Task hoặc thời gian annotation."],
				["Phạm vi", "Giao QC một lần cho mỗi Job. ID cuối lấy từ Daily Report đã gửi gần nhất trước ngày bắt đầu, tiếp tục từ mốc đã QC và sửa xong. Mỗi lượt giữ phạm vi và lịch sử riêng; QC không tự đóng toàn bộ Job."],
				["Sửa lỗi", "Annotator xác nhận đã sửa; QC xác minh lại. Lỗi cũ vẫn sai được tạo log mới có liên kết về lỗi ban đầu."]
			]
		}
	];
}
//#endregion
//#region lib/report-export.ts
var labels = {
	todo: "Chưa bắt đầu",
	doing: "Đang làm",
	qa: "Chờ QA/QC",
	changes: "Cần sửa / bổ sung",
	recheck: "Đã sửa · Chờ kiểm tra lại",
	done: "Hoàn thành",
	draft: "Nháp",
	submitted: "Đã gửi",
	approved: "Đã duyệt",
	imported: "Chưa duyệt",
	present: "Có mặt",
	late: "Đi muộn",
	leave: "Nghỉ phép",
	half: "Nghỉ nửa ngày",
	absent: "Vắng",
	passed: "Đạt",
	active: "Đang thực hiện",
	low: "Thấp",
	normal: "Bình thường",
	high: "Cao",
	urgent: "Khẩn cấp",
	minor: "Nhẹ",
	major: "Nặng",
	critical: "Nghiêm trọng"
};
var label = (s) => labels[s] || s || "";
var date = (s) => s ? /* @__PURE__ */ new Date(s.slice(0, 10) + "T00:00:00Z") : null;
var time = (s) => s ? new Date(s).toLocaleTimeString("vi-VN", {
	timeZone: "Asia/Ho_Chi_Minh",
	hour: "2-digit",
	minute: "2-digit"
}) : "";
var timestamp = (s) => s ? new Date(s).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "";
var formula = (formula, value, format) => ({
	formula,
	value,
	format
});
function reportSheets(kind, records, all, members, weekly = {}, scope = {}) {
	if (kind === "qc-session") return qcSessionSheets(records, all, members);
	const member = (id) => members.find((m) => m.id === id), name = (id) => member(id)?.name || "", handle = (id) => member(id)?.email?.split("@")[0] || "";
	const get = (id) => all.find((r) => r.id === id), task = (r) => get(r.task_id), project = (r) => get(r?.project_id);
	const lineSummary = (l) => l.work?.trim() || [
		"Task " + (l.taskCode || get(l.taskId)?.data.code || "—") + " · Job " + (l.jobId || get(l.taskId)?.data.jobId || "—"),
		l.activity === "qc" ? "QC" : reportEndId(l) ? "Tới ID " + reportEndId(l) : "Chưa ghi ID cuối",
		l.activity === "qc" ? l.minutes == null ? "Chưa có thời gian" : l.minutes + " phút" : l.quantity == null ? "Chưa có sản lượng" : l.quantity + " " + (project(get(l.taskId))?.data.unit || "cuboid") + " trong ngày"
	].join(" · ");
	const reportSummary = (r) => [r.data.completed?.trim() || (r.data.lines || []).map(lineSummary).join("\n"), reportedQcLabel(r)].filter(Boolean).join("\n");
	records = [...records].sort((a, b) => (kind === "daily" ? -1 : 1) * (a.date || a.data.assignedDate || "").localeCompare(b.date || b.data.assignedDate || "") || name(a.owner_id).localeCompare(name(b.owner_id), "vi"));
	const owners = scope.kpiMembers || members.filter((m) => records.some((r) => r.owner_id === m.id && !r.data.scoped)), config = all.find((r) => r.id === "settings")?.data || {};
	const add = (day) => {
		const d = /* @__PURE__ */ new Date(day + "T12:00:00Z");
		d.setUTCDate(d.getUTCDate() + 1);
		return d.toISOString().slice(0, 10);
	};
	const weeklyKpiOnly = scope.kpiPeriod === "weekly", asOf = scope.asOf || vietnamToday(), summarize = (memberId) => weeklyKpiOnly ? weeklyKpi(memberId, all, asOf) : cumulativeKpi(memberId, all, asOf);
	const calendar = [[
		"Ngày",
		"Nhân sự",
		"Tên đăng nhập",
		"Mức KPI (cuboid/ngày)",
		"Theo lịch công ty",
		"Không tính KPI",
		"Mục tiêu ngày (cuboid)",
		"Đã làm (cuboid)"
	]];
	if (kind === "daily") for (const m of owners) {
		const k = summarize(m.id);
		for (let d = k.start; d <= k.end; d = add(d)) {
			const excluded = all.some((r) => r.kind === "kpi-exclusion" && r.status === "active" && r.date === d && (!r.owner_id || r.owner_id === m.id));
			const reports = d > asOf ? [] : all.filter((r) => r.kind === "daily" && r.owner_id === m.id && r.date === d && [
				"submitted",
				"approved",
				"imported"
			].includes(r.status) && !r.data.scoped);
			calendar.push([
				date(d),
				m.name,
				handle(m.id),
				dailyRate(m.id, d, all),
				scheduledWorkday(d, config) ? "Làm việc" : "Nghỉ",
				excluded ? "Có" : "Không",
				kpiDayTarget(d, m.id, all),
				reports.reduce((n, r) => n + dailyKpi(r, all).quantity, 0)
			]);
		}
	}
	if (kind === "morning") {
		const production = scope.productionDate, morning = scope.morningDate;
		const yesterday = /* @__PURE__ */ new Date(morning + "T12:00:00Z");
		yesterday.setUTCDate(yesterday.getUTCDate() - 1);
		const errorOwners = new Set(all.filter((r) => r.kind === "review" && (qcDay(r.data.checkedAt) || r.date) === yesterday.toISOString().slice(0, 10) && (r.data.errors || []).length > 0).map((r) => r.data.fixerId || task(r)?.data.assigneeId));
		const summary = {
			name: "Bao cao buoi sang",
			rows: [[
				"Ngày báo cáo sáng",
				"Ngày sản lượng",
				"Nhân sự",
				"Tên đăng nhập",
				"Hôm qua đã làm gì",
				"Task ID",
				"Job ID",
				"ID đã làm tới",
				"Cuboid đã làm",
				"KPI ngày (cuboid)",
				"Kết quả KPI",
				"Hôm nay dự kiến làm gì",
				"Vấn đề / vướng mắc",
				"Hỗ trợ cần thiết"
			], ...owners.map((m) => {
				const r = records.find((r) => r.owner_id === m.id), lines = r?.data.lines || [], k = r ? dailyKpi(r, all) : null;
				const combine = (key) => lines.map((l) => (key === "endId" ? reportEndId(l) : l[key]) || "").filter(Boolean).join("\n");
				const tasks = lines.map((l) => get(l.taskId));
				const plan = errorOwners.has(m.id) ? `sửa log hôm qua, làm ${kpiDayTarget(morning, m.id, all)} cuboiz` : nextWorkday(production, config) === morning ? r?.data.nextPlan || "Chưa cập nhật" : "Chưa cập nhật cho ngày báo cáo";
				return [
					date(morning),
					date(production),
					m.name,
					handle(m.id),
					r ? reportSummary(r) : "Chưa gửi báo cáo",
					lines.map((l, i) => l.taskCode || tasks[i]?.data.code || "").join("\n"),
					lines.map((l, i) => l.jobId || tasks[i]?.data.jobId || "—").join("\n"),
					combine("endId"),
					k?.applicable ? k.quantity : null,
					kpiDayTarget(production, m.id, all),
					k?.result || "Chưa có báo cáo",
					plan,
					[...new Set([r?.data.blockers, ...lines.map((l) => l.issue)].filter(Boolean))].join("\n"),
					r?.data.support || ""
				];
			})]
		};
		const details = reportSheets("daily", records, all, members, weekly, {
			...scope,
			kpiMembers: []
		}).find((s) => s.name === "Chi tiet cong viec");
		const statusColumn = details.rows[0].indexOf("Trạng thái báo cáo");
		return [summary, {
			...details,
			name: "Chi tiet ngay truoc",
			rows: details.rows.map((row) => row.filter((_, i) => i !== statusColumn))
		}];
	}
	if (kind === "attendance") return [{
		name: "Diem danh",
		rows: [[
			"Ngày",
			"Nhân sự",
			"Tên đăng nhập",
			"Vai trò",
			"Trạng thái",
			"Trễ (phút)",
			"Tác phong",
			"Giờ vào (UTC+7)",
			"Giờ ra (UTC+7)",
			"Ghi chú",
			"Người ghi nhận",
			"Cập nhật (UTC+7)"
		], ...records.map((r) => [
			date(r.date),
			name(r.owner_id),
			handle(r.owner_id),
			member(r.owner_id)?.role,
			label(r.status),
			r.data.lateMinutes ?? 0,
			r.data.conduct || "Chưa đánh giá",
			time(r.data.checkIn),
			time(r.data.checkOut),
			r.data.note || "",
			r.data.defaulted ? "Mặc định" : name(r.data.markedBy || r.data.adjustedBy),
			timestamp(r.updated_at)
		])]
	}];
	if (kind === "task") return [{
		name: "Phan cong",
		rows: [[
			"Task ID",
			"Job ID",
			"Số frame của Job",
			"Tên bài",
			"Dự án",
			"Người thực hiện",
			"Tên đăng nhập",
			"Người QC",
			"Trạng thái",
			"Đơn vị",
			"Khối lượng giao",
			"Đã hoàn thành",
			"ID đã làm tới",
			"Ngày giao",
			"Hạn hoàn thành",
			"Ưu tiên",
			"Link làm bài",
			"Ghi chú"
		], ...records.map((r) => [
			r.data.code,
			r.data.jobId || "",
			taskFrameCount(r),
			r.data.title,
			project(r)?.data.name,
			name(r.data.assigneeId),
			handle(r.data.assigneeId),
			name(r.data.reviewerId),
			label(r.status),
			project(r)?.data.unit,
			r.data.quantity,
			r.data.completed,
			r.data.latestEndId || "",
			date(r.data.assignedDate),
			date(r.data.deadline),
			label(r.data.priority),
			r.data.link,
			r.data.note
		])]
	}];
	if (kind === "daily") return [
		{
			name: "Tong hop ngay",
			rows: [[
				"Ngày",
				"Nhân sự",
				"Tên đăng nhập",
				"Vai trò",
				"Cuboid trong ngày",
				"KPI cuboid/ngày",
				"Còn thiếu (cuboid)",
				"Hoàn thành KPI (%)",
				"Kết quả KPI",
				"Annotation (phút)",
				"QC (phút)",
				"Trạng thái báo cáo",
				"Kết quả công việc",
				"Vướng mắc",
				"Hỗ trợ cần thiết",
				"Kế hoạch tiếp theo"
			], ...records.map((r, i) => {
				const k = dailyKpi(r, all), n = i + 2, lines = r.data.lines || [];
				const mins = (qc) => {
					const selected = lines.filter((l) => l.activity === "qc" === qc);
					return selected.some((l) => l.minutes == null) ? null : selected.reduce((s, l) => s + l.minutes, 0);
				};
				return [
					date(r.date),
					name(r.owner_id),
					handle(r.owner_id),
					member(r.owner_id)?.role,
					k.applicable ? k.quantity : null,
					k.applicable ? k.target : null,
					k.applicable ? formula(`MAX(0,F${n}-E${n})`, k.remaining) : null,
					k.applicable && k.target ? formula(`E${n}/F${n}`, k.ratio, "percent") : null,
					k.pending ? k.result : k.applicable ? formula(`IF(F${n}=0,"Không tính KPI",IF(E${n}>=F${n},"Đạt","Chưa đạt"))`, k.result) : k.result,
					mins(false),
					mins(true),
					label(r.status),
					reportSummary(r),
					r.data.blockers,
					r.data.support,
					r.data.nextPlan
				];
			})]
		},
		{
			name: "Chi tiet cong viec",
			rows: [[
				"Ngày",
				"Nhân sự",
				"Tên đăng nhập",
				"Task ID",
				"Job ID",
				"ID đã làm tới",
				"Hoạt động",
				"Đơn vị",
				"Sản lượng trong ngày",
				"Sửa lỗi",
				"Thời gian (phút)",
				"Công việc",
				"Vướng mắc",
				"Link minh chứng",
				"Link làm bài",
				"Trạng thái báo cáo",
				"ID làm trong ngày",
				"Frame dùng tính",
				"Hệ số",
				"Cách tính sản lượng",
				"Từ ID mới",
				"Đến ID mới",
				"Keyframe hiện",
				"Keyframe outside",
				"Mã file đếm SHA-256",
				"Cuboid mốc ban đầu",
				"Cuboid ID mới"
			], ...records.flatMap((r) => (r.data.lines || []).map((l) => {
				const t = get(l.taskId);
				return [
					date(r.date),
					name(r.owner_id),
					handle(r.owner_id),
					l.taskCode || t?.data.code,
					l.jobId || t?.data.jobId || "",
					reportEndId(l),
					l.activity === "qc" ? "QC" : "Annotation",
					project(t)?.data.unit,
					l.activity === "qc" ? null : l.quantity,
					l.activity === "qc" ? null : l.rework,
					l.minutes,
					lineSummary(l),
					l.issue,
					l.evidence,
					t?.data.link,
					label(r.status),
					l.idCount ?? l.reportedIdCount ?? null,
					l.frameCountAtReport ?? null,
					l.productionFactor ?? null,
					l.productionMethod === "datumaro-baseline-v1" ? "Mốc Datumaro + ID mới" : l.productionMethod === "keyframe-v1" ? "Keyframe (gồm outside)" : "Sản lượng đã lưu",
					l.keyframeSnapshot?.start ?? null,
					l.keyframeSnapshot?.end ?? null,
					l.keyframeSnapshot?.visible ?? null,
					l.keyframeSnapshot?.outside ?? null,
					l.keyframeSnapshot?.fileHash || "",
					l.keyframeSnapshot?.baseline ?? null,
					l.keyframeSnapshot?.added ?? null
				];
			}))]
		},
		{
			name: weeklyKpiOnly ? "KPI tuan" : "KPI luy ke",
			rows: [[
				"Nhân sự",
				"Tên đăng nhập",
				weeklyKpiOnly ? "Bắt đầu tuần" : "Bắt đầu lũy kế",
				weeklyKpiOnly ? "Kết thúc tuần" : "Tính đến ngày",
				"Ngày tính KPI",
				"KPI ngày hiện tại",
				"Cuboid đã làm",
				weeklyKpiOnly ? "KPI tuần" : "KPI lũy kế",
				"Còn thiếu",
				"Hoàn thành KPI (%)",
				"Kết quả"
			], ...owners.map((m, i) => {
				const k = summarize(m.id), n = i + 2, last = Math.max(2, calendar.length), who = `B${n}`, base = `'Lich KPI'!`;
				return [
					m.name,
					handle(m.id),
					date(k.start),
					date(k.end),
					k.days,
					k.currentRate,
					formula(`SUMIFS(${base}$H$2:$H$${last},${base}$C$2:$C$${last},${who})`, k.quantity),
					formula(`SUMIFS(${base}$G$2:$G$${last},${base}$C$2:$C$${last},${who})`, k.target),
					formula(`MAX(0,H${n}-G${n})`, k.remaining),
					k.target ? formula(`G${n}/H${n}`, k.ratio, "percent") : null,
					k.pendingReports ? k.result : formula(`IF(H${n}=0,"Không tính KPI",IF(G${n}>=H${n},"Đạt","Chưa đạt"))`, k.result)
				];
			})]
		},
		{
			name: "Lich KPI",
			rows: calendar
		}
	];
	if (kind === "weekly") return [{
		name: "Bao cao tuan",
		rows: [[
			"Từ ngày",
			"Đến ngày",
			"Nhân sự",
			"Tên đăng nhập",
			"Trạng thái",
			"Annotation (phút)",
			"QC (phút)",
			"Task hoàn thành",
			"Task đang mở",
			"Task quá hạn",
			"Kết quả nổi bật",
			"Khó khăn",
			"Đề xuất",
			"Kế hoạch tuần tới"
		], ...records.map((r) => {
			const a = r.data.snapshot || weekly[r.id] || {};
			const end = /* @__PURE__ */ new Date((r.date || "") + "T00:00:00Z");
			end.setUTCDate(end.getUTCDate() + 6);
			return [
				date(r.date),
				end,
				name(r.owner_id),
				handle(r.owner_id),
				label(r.status),
				a.annotationMinutes,
				a.qcMinutes,
				a.tasks?.completed,
				a.tasks?.open,
				a.tasks?.overdue,
				r.data.highlights,
				r.data.difficulties,
				r.data.improvements,
				r.data.nextPlan
			];
		})]
	}, {
		name: "San luong tuan",
		rows: [[
			"Tuần bắt đầu",
			"Nhân sự",
			"Dự án",
			"Đơn vị",
			"Sản lượng",
			"Sửa lỗi",
			"Đã kiểm lần đầu",
			"Đạt lần đầu",
			"Tỷ lệ đạt lần đầu (%)"
		], ...records.flatMap((r) => {
			const a = r.data.snapshot || weekly[r.id] || {};
			return (a.products || []).map((p) => {
				const q = a.firstPass?.[p.projectId];
				return [
					date(r.date),
					name(r.owner_id),
					p.project,
					p.unit,
					p.quantity,
					p.missingReworkLines ? null : p.rework,
					q?.checked ?? null,
					q?.passed ?? null,
					q?.checked ? formula(`${q.passed}/${q.checked}`, q.passed / q.checked, "percent") : null
				];
			});
		})]
	}];
	if (kind === "review") return [{
		name: "Ket qua QC",
		rows: [[
			"Ngày QC",
			"Ngày sản lượng",
			"Task ID",
			"Job ID",
			"Dự án",
			"Annotator",
			"Người QC",
			"Lượt kiểm",
			"Phạm vi",
			"Mô tả mẫu",
			"Đơn vị",
			"Đã kiểm",
			"Đạt",
			"Cần sửa",
			"Kết luận QC",
			"Lỗi đã sửa",
			"Tổng số lỗi",
			"Trạng thái sửa",
			"Ghi chú"
		], ...records.map((r) => {
			const t = task(r), errors = r.data.errors || [];
			return [
				date(r.date),
				date(r.data.productionDate),
				t?.data.code,
				t?.data.jobId || "",
				project(r)?.data.name,
				name(t?.data.assigneeId),
				name(r.owner_id),
				r.data.round,
				r.data.mode === "daily" ? "QC theo ngày" : r.data.scope === "sample" ? "Kiểm mẫu" : "Toàn bộ",
				r.data.mode === "daily" ? "ID " + (r.data.rangeStart || "—") + " → " + r.data.endId : r.data.sample,
				project(r)?.data.unit,
				r.data.checked,
				r.data.passed,
				r.data.failed,
				label(r.status),
				errors.filter((e) => e.fixed).length,
				errors.length,
				errors.length ? errors.every((e) => e.fixed) ? "Đã sửa" : "Chưa sửa" : "Không có lỗi",
				r.data.note
			];
		})]
	}, {
		name: "Chi tiet loi",
		rows: [[
			"Ngày QC",
			"Task ID",
			"Job ID",
			"Annotator",
			"Người QC",
			"Lượt kiểm",
			"STT lỗi",
			"Loại lỗi",
			"Mức độ",
			"Mô tả lỗi",
			"Minh chứng",
			"Trạng thái sửa",
			"Người sửa",
			"Thời điểm sửa (UTC+7)",
			"Ghi chú sửa",
			"Object ID",
			"Frame ID",
			"QC xác minh lại",
			"Thời điểm xác minh (UTC+7)"
		], ...records.flatMap((r) => (r.data.errors || []).map((e, i) => {
			const t = task(r);
			return [
				date(r.date),
				t?.data.code,
				t?.data.jobId || "",
				name(t?.data.assigneeId),
				name(r.owner_id),
				r.data.round,
				i + 1,
				e.type,
				label(e.severity),
				e.description,
				e.evidence,
				e.fixed ? "Đã sửa" : "Chưa sửa",
				name(e.fixedBy),
				timestamp(e.fixedAt),
				e.fixNote,
				e.objectId || "",
				e.frameId || "",
				e.verification === "passed" ? "Sửa đúng" : e.verification === "failed" ? "Vẫn sai · đã ghi tiếp" : "Chưa xác minh",
				timestamp(e.verifiedAt)
			];
		}))]
	}];
	return [{
		name: "Chi tieu",
		rows: [[
			"Nhân sự",
			"Tên đăng nhập",
			"Dự án",
			"Đơn vị",
			"Từ ngày",
			"Đến ngày",
			"Chỉ tiêu trong khoảng"
		], ...records.map((r) => [
			name(r.owner_id),
			handle(r.owner_id),
			project(r)?.data.name,
			project(r)?.data.unit,
			date(r.data.from),
			date(r.data.to),
			r.data.quantity
		])]
	}];
}
//#endregion
//#region node_modules/fflate/esm/browser.js
var u8 = Uint8Array, u16 = Uint16Array, u32 = Uint32Array;
var fleb = new u8([
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	0,
	1,
	1,
	1,
	1,
	2,
	2,
	2,
	2,
	3,
	3,
	3,
	3,
	4,
	4,
	4,
	4,
	5,
	5,
	5,
	5,
	0,
	0,
	0,
	0
]);
var fdeb = new u8([
	0,
	0,
	0,
	0,
	1,
	1,
	2,
	2,
	3,
	3,
	4,
	4,
	5,
	5,
	6,
	6,
	7,
	7,
	8,
	8,
	9,
	9,
	10,
	10,
	11,
	11,
	12,
	12,
	13,
	13,
	0,
	0
]);
var clim = new u8([
	16,
	17,
	18,
	0,
	8,
	7,
	9,
	6,
	10,
	5,
	11,
	4,
	12,
	3,
	13,
	2,
	14,
	1,
	15
]);
var freb = function(eb, start) {
	var b = new u16(31);
	for (var i = 0; i < 31; ++i) b[i] = start += 1 << eb[i - 1];
	var r = new u32(b[30]);
	for (var i = 1; i < 30; ++i) for (var j = b[i]; j < b[i + 1]; ++j) r[j] = j - b[i] << 5 | i;
	return [b, r];
};
var _a = freb(fleb, 2), fl = _a[0], revfl = _a[1];
fl[28] = 258, revfl[258] = 28;
var _b = freb(fdeb, 0), fd = _b[0], revfd = _b[1];
var rev = new u16(32768);
for (var i = 0; i < 32768; ++i) {
	var x = (i & 43690) >>> 1 | (i & 21845) << 1;
	x = (x & 52428) >>> 2 | (x & 13107) << 2;
	x = (x & 61680) >>> 4 | (x & 3855) << 4;
	rev[i] = ((x & 65280) >>> 8 | (x & 255) << 8) >>> 1;
}
var hMap = (function(cd, mb, r) {
	var s = cd.length;
	var i = 0;
	var l = new u16(mb);
	for (; i < s; ++i) if (cd[i]) ++l[cd[i] - 1];
	var le = new u16(mb);
	for (i = 0; i < mb; ++i) le[i] = le[i - 1] + l[i - 1] << 1;
	var co;
	if (r) {
		co = new u16(1 << mb);
		var rvb = 15 - mb;
		for (i = 0; i < s; ++i) if (cd[i]) {
			var sv = i << 4 | cd[i];
			var r_1 = mb - cd[i];
			var v = le[cd[i] - 1]++ << r_1;
			for (var m = v | (1 << r_1) - 1; v <= m; ++v) co[rev[v] >>> rvb] = sv;
		}
	} else {
		co = new u16(s);
		for (i = 0; i < s; ++i) if (cd[i]) co[i] = rev[le[cd[i] - 1]++] >>> 15 - cd[i];
	}
	return co;
});
var flt = new u8(288);
for (var i = 0; i < 144; ++i) flt[i] = 8;
for (var i = 144; i < 256; ++i) flt[i] = 9;
for (var i = 256; i < 280; ++i) flt[i] = 7;
for (var i = 280; i < 288; ++i) flt[i] = 8;
var fdt = new u8(32);
for (var i = 0; i < 32; ++i) fdt[i] = 5;
var flm = /* @__PURE__ */ hMap(flt, 9, 0), flrm = /* @__PURE__ */ hMap(flt, 9, 1);
var fdm = /* @__PURE__ */ hMap(fdt, 5, 0), fdrm = /* @__PURE__ */ hMap(fdt, 5, 1);
var max = function(a) {
	var m = a[0];
	for (var i = 1; i < a.length; ++i) if (a[i] > m) m = a[i];
	return m;
};
var bits = function(d, p, m) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
};
var bits16 = function(d, p) {
	var o = p / 8 | 0;
	return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
};
var shft = function(p) {
	return (p + 7) / 8 | 0;
};
var slc = function(v, s, e) {
	if (s == null || s < 0) s = 0;
	if (e == null || e > v.length) e = v.length;
	var n = new (v.BYTES_PER_ELEMENT == 2 ? u16 : v.BYTES_PER_ELEMENT == 4 ? u32 : u8)(e - s);
	n.set(v.subarray(s, e));
	return n;
};
var ec = [
	"unexpected EOF",
	"invalid block type",
	"invalid length/literal",
	"invalid distance",
	"stream finished",
	"no stream handler",
	,
	"no callback",
	"invalid UTF-8 data",
	"extra field too long",
	"date not in range 1980-2099",
	"filename too long",
	"stream finishing",
	"invalid zip data"
];
var err = function(ind, msg, nt) {
	var e = new Error(msg || ec[ind]);
	e.code = ind;
	if (Error.captureStackTrace) Error.captureStackTrace(e, err);
	if (!nt) throw e;
	return e;
};
var inflt = function(dat, buf, st) {
	var sl = dat.length;
	if (!sl || st && st.f && !st.l) return buf || new u8(0);
	var noBuf = !buf || st;
	var noSt = !st || st.i;
	if (!st) st = {};
	if (!buf) buf = new u8(sl * 3);
	var cbuf = function(l) {
		var bl = buf.length;
		if (l > bl) {
			var nbuf = new u8(Math.max(bl * 2, l));
			nbuf.set(buf);
			buf = nbuf;
		}
	};
	var final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n;
	var tbts = sl * 8;
	do {
		if (!lm) {
			final = bits(dat, pos, 1);
			var type = bits(dat, pos + 1, 3);
			pos += 3;
			if (!type) {
				var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
				if (t > sl) {
					if (noSt) err(0);
					break;
				}
				if (noBuf) cbuf(bt + l);
				buf.set(dat.subarray(s, t), bt);
				st.b = bt += l, st.p = pos = t * 8, st.f = final;
				continue;
			} else if (type == 1) lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
			else if (type == 2) {
				var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4;
				var tl = hLit + bits(dat, pos + 5, 31) + 1;
				pos += 14;
				var ldt = new u8(tl);
				var clt = new u8(19);
				for (var i = 0; i < hcLen; ++i) clt[clim[i]] = bits(dat, pos + i * 3, 7);
				pos += hcLen * 3;
				var clb = max(clt), clbmsk = (1 << clb) - 1;
				var clm = hMap(clt, clb, 1);
				for (var i = 0; i < tl;) {
					var r = clm[bits(dat, pos, clbmsk)];
					pos += r & 15;
					var s = r >>> 4;
					if (s < 16) ldt[i++] = s;
					else {
						var c = 0, n = 0;
						if (s == 16) n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i - 1];
						else if (s == 17) n = 3 + bits(dat, pos, 7), pos += 3;
						else if (s == 18) n = 11 + bits(dat, pos, 127), pos += 7;
						while (n--) ldt[i++] = c;
					}
				}
				var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
				lbt = max(lt);
				dbt = max(dt);
				lm = hMap(lt, lbt, 1);
				dm = hMap(dt, dbt, 1);
			} else err(1);
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
		}
		if (noBuf) cbuf(bt + 131072);
		var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1;
		var lpos = pos;
		for (;; lpos = pos) {
			var c = lm[bits16(dat, pos) & lms], sym = c >>> 4;
			pos += c & 15;
			if (pos > tbts) {
				if (noSt) err(0);
				break;
			}
			if (!c) err(2);
			if (sym < 256) buf[bt++] = sym;
			else if (sym == 256) {
				lpos = pos, lm = null;
				break;
			} else {
				var add = sym - 254;
				if (sym > 264) {
					var i = sym - 257, b = fleb[i];
					add = bits(dat, pos, (1 << b) - 1) + fl[i];
					pos += b;
				}
				var d = dm[bits16(dat, pos) & dms], dsym = d >>> 4;
				if (!d) err(3);
				pos += d & 15;
				var dt = fd[dsym];
				if (dsym > 3) {
					var b = fdeb[dsym];
					dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
				}
				if (pos > tbts) {
					if (noSt) err(0);
					break;
				}
				if (noBuf) cbuf(bt + 131072);
				var end = bt + add;
				for (; bt < end; bt += 4) {
					buf[bt] = buf[bt - dt];
					buf[bt + 1] = buf[bt + 1 - dt];
					buf[bt + 2] = buf[bt + 2 - dt];
					buf[bt + 3] = buf[bt + 3 - dt];
				}
				bt = end;
			}
		}
		st.l = lm, st.p = lpos, st.b = bt, st.f = final;
		if (lm) final = 1, st.m = lbt, st.d = dm, st.n = dbt;
	} while (!final);
	return bt == buf.length ? buf : slc(buf, 0, bt);
};
var wbits = function(d, p, v) {
	v <<= p & 7;
	var o = p / 8 | 0;
	d[o] |= v;
	d[o + 1] |= v >>> 8;
};
var wbits16 = function(d, p, v) {
	v <<= p & 7;
	var o = p / 8 | 0;
	d[o] |= v;
	d[o + 1] |= v >>> 8;
	d[o + 2] |= v >>> 16;
};
var hTree = function(d, mb) {
	var t = [];
	for (var i = 0; i < d.length; ++i) if (d[i]) t.push({
		s: i,
		f: d[i]
	});
	var s = t.length;
	var t2 = t.slice();
	if (!s) return [et, 0];
	if (s == 1) {
		var v = new u8(t[0].s + 1);
		v[t[0].s] = 1;
		return [v, 1];
	}
	t.sort(function(a, b) {
		return a.f - b.f;
	});
	t.push({
		s: -1,
		f: 25001
	});
	var l = t[0], r = t[1], i0 = 0, i1 = 1, i2 = 2;
	t[0] = {
		s: -1,
		f: l.f + r.f,
		l,
		r
	};
	while (i1 != s - 1) {
		l = t[t[i0].f < t[i2].f ? i0++ : i2++];
		r = t[i0 != i1 && t[i0].f < t[i2].f ? i0++ : i2++];
		t[i1++] = {
			s: -1,
			f: l.f + r.f,
			l,
			r
		};
	}
	var maxSym = t2[0].s;
	for (var i = 1; i < s; ++i) if (t2[i].s > maxSym) maxSym = t2[i].s;
	var tr = new u16(maxSym + 1);
	var mbt = ln(t[i1 - 1], tr, 0);
	if (mbt > mb) {
		var i = 0, dt = 0;
		var lft = mbt - mb, cst = 1 << lft;
		t2.sort(function(a, b) {
			return tr[b.s] - tr[a.s] || a.f - b.f;
		});
		for (; i < s; ++i) {
			var i2_1 = t2[i].s;
			if (tr[i2_1] > mb) {
				dt += cst - (1 << mbt - tr[i2_1]);
				tr[i2_1] = mb;
			} else break;
		}
		dt >>>= lft;
		while (dt > 0) {
			var i2_2 = t2[i].s;
			if (tr[i2_2] < mb) dt -= 1 << mb - tr[i2_2]++ - 1;
			else ++i;
		}
		for (; i >= 0 && dt; --i) {
			var i2_3 = t2[i].s;
			if (tr[i2_3] == mb) {
				--tr[i2_3];
				++dt;
			}
		}
		mbt = mb;
	}
	return [new u8(tr), mbt];
};
var ln = function(n, l, d) {
	return n.s == -1 ? Math.max(ln(n.l, l, d + 1), ln(n.r, l, d + 1)) : l[n.s] = d;
};
var lc = function(c) {
	var s = c.length;
	while (s && !c[--s]);
	var cl = new u16(++s);
	var cli = 0, cln = c[0], cls = 1;
	var w = function(v) {
		cl[cli++] = v;
	};
	for (var i = 1; i <= s; ++i) if (c[i] == cln && i != s) ++cls;
	else {
		if (!cln && cls > 2) {
			for (; cls > 138; cls -= 138) w(32754);
			if (cls > 2) {
				w(cls > 10 ? cls - 11 << 5 | 28690 : cls - 3 << 5 | 12305);
				cls = 0;
			}
		} else if (cls > 3) {
			w(cln), --cls;
			for (; cls > 6; cls -= 6) w(8304);
			if (cls > 2) w(cls - 3 << 5 | 8208), cls = 0;
		}
		while (cls--) w(cln);
		cls = 1;
		cln = c[i];
	}
	return [cl.subarray(0, cli), s];
};
var clen = function(cf, cl) {
	var l = 0;
	for (var i = 0; i < cl.length; ++i) l += cf[i] * cl[i];
	return l;
};
var wfblk = function(out, pos, dat) {
	var s = dat.length;
	var o = shft(pos + 2);
	out[o] = s & 255;
	out[o + 1] = s >>> 8;
	out[o + 2] = out[o] ^ 255;
	out[o + 3] = out[o + 1] ^ 255;
	for (var i = 0; i < s; ++i) out[o + i + 4] = dat[i];
	return (o + 4 + s) * 8;
};
var wblk = function(dat, out, final, syms, lf, df, eb, li, bs, bl, p) {
	wbits(out, p++, final);
	++lf[256];
	var _a = hTree(lf, 15), dlt = _a[0], mlb = _a[1];
	var _b = hTree(df, 15), ddt = _b[0], mdb = _b[1];
	var _c = lc(dlt), lclt = _c[0], nlc = _c[1];
	var _d = lc(ddt), lcdt = _d[0], ndc = _d[1];
	var lcfreq = new u16(19);
	for (var i = 0; i < lclt.length; ++i) lcfreq[lclt[i] & 31]++;
	for (var i = 0; i < lcdt.length; ++i) lcfreq[lcdt[i] & 31]++;
	var _e = hTree(lcfreq, 7), lct = _e[0], mlcb = _e[1];
	var nlcc = 19;
	for (; nlcc > 4 && !lct[clim[nlcc - 1]]; --nlcc);
	var flen = bl + 5 << 3;
	var ftlen = clen(lf, flt) + clen(df, fdt) + eb;
	var dtlen = clen(lf, dlt) + clen(df, ddt) + eb + 14 + 3 * nlcc + clen(lcfreq, lct) + (2 * lcfreq[16] + 3 * lcfreq[17] + 7 * lcfreq[18]);
	if (flen <= ftlen && flen <= dtlen) return wfblk(out, p, dat.subarray(bs, bs + bl));
	var lm, ll, dm, dl;
	wbits(out, p, 1 + (dtlen < ftlen)), p += 2;
	if (dtlen < ftlen) {
		lm = hMap(dlt, mlb, 0), ll = dlt, dm = hMap(ddt, mdb, 0), dl = ddt;
		var llm = hMap(lct, mlcb, 0);
		wbits(out, p, nlc - 257);
		wbits(out, p + 5, ndc - 1);
		wbits(out, p + 10, nlcc - 4);
		p += 14;
		for (var i = 0; i < nlcc; ++i) wbits(out, p + 3 * i, lct[clim[i]]);
		p += 3 * nlcc;
		var lcts = [lclt, lcdt];
		for (var it = 0; it < 2; ++it) {
			var clct = lcts[it];
			for (var i = 0; i < clct.length; ++i) {
				var len = clct[i] & 31;
				wbits(out, p, llm[len]), p += lct[len];
				if (len > 15) wbits(out, p, clct[i] >>> 5 & 127), p += clct[i] >>> 12;
			}
		}
	} else lm = flm, ll = flt, dm = fdm, dl = fdt;
	for (var i = 0; i < li; ++i) if (syms[i] > 255) {
		var len = syms[i] >>> 18 & 31;
		wbits16(out, p, lm[len + 257]), p += ll[len + 257];
		if (len > 7) wbits(out, p, syms[i] >>> 23 & 31), p += fleb[len];
		var dst = syms[i] & 31;
		wbits16(out, p, dm[dst]), p += dl[dst];
		if (dst > 3) wbits16(out, p, syms[i] >>> 5 & 8191), p += fdeb[dst];
	} else wbits16(out, p, lm[syms[i]]), p += ll[syms[i]];
	wbits16(out, p, lm[256]);
	return p + ll[256];
};
var deo = /* @__PURE__ */ new u32([
	65540,
	131080,
	131088,
	131104,
	262176,
	1048704,
	1048832,
	2114560,
	2117632
]);
var et = /* @__PURE__ */ new u8(0);
var dflt = function(dat, lvl, plvl, pre, post, lst) {
	var s = dat.length;
	var o = new u8(pre + s + 5 * (1 + Math.ceil(s / 7e3)) + post);
	var w = o.subarray(pre, o.length - post);
	var pos = 0;
	if (!lvl || s < 8) for (var i = 0; i <= s; i += 65535) {
		var e = i + 65535;
		if (e >= s) w[pos >> 3] = lst;
		pos = wfblk(w, pos + 1, dat.subarray(i, e));
	}
	else {
		var opt = deo[lvl - 1];
		var n = opt >>> 13, c = opt & 8191;
		var msk_1 = (1 << plvl) - 1;
		var prev = new u16(32768), head = new u16(msk_1 + 1);
		var bs1_1 = Math.ceil(plvl / 3), bs2_1 = 2 * bs1_1;
		var hsh = function(i) {
			return (dat[i] ^ dat[i + 1] << bs1_1 ^ dat[i + 2] << bs2_1) & msk_1;
		};
		var syms = new u32(25e3);
		var lf = new u16(288), df = new u16(32);
		var lc_1 = 0, eb = 0, i = 0, li = 0, wi = 0, bs = 0;
		for (; i < s; ++i) {
			var hv = hsh(i);
			var imod = i & 32767, pimod = head[hv];
			prev[imod] = pimod;
			head[hv] = imod;
			if (wi <= i) {
				var rem = s - i;
				if ((lc_1 > 7e3 || li > 24576) && rem > 423) {
					pos = wblk(dat, w, 0, syms, lf, df, eb, li, bs, i - bs, pos);
					li = lc_1 = eb = 0, bs = i;
					for (var j = 0; j < 286; ++j) lf[j] = 0;
					for (var j = 0; j < 30; ++j) df[j] = 0;
				}
				var l = 2, d = 0, ch_1 = c, dif = imod - pimod & 32767;
				if (rem > 2 && hv == hsh(i - dif)) {
					var maxn = Math.min(n, rem) - 1;
					var maxd = Math.min(32767, i);
					var ml = Math.min(258, rem);
					while (dif <= maxd && --ch_1 && imod != pimod) {
						if (dat[i + l] == dat[i + l - dif]) {
							var nl = 0;
							for (; nl < ml && dat[i + nl] == dat[i + nl - dif]; ++nl);
							if (nl > l) {
								l = nl, d = dif;
								if (nl > maxn) break;
								var mmd = Math.min(dif, nl - 2);
								var md = 0;
								for (var j = 0; j < mmd; ++j) {
									var ti = i - dif + j + 32768 & 32767;
									var cd = ti - prev[ti] + 32768 & 32767;
									if (cd > md) md = cd, pimod = ti;
								}
							}
						}
						imod = pimod, pimod = prev[imod];
						dif += imod - pimod + 32768 & 32767;
					}
				}
				if (d) {
					syms[li++] = 268435456 | revfl[l] << 18 | revfd[d];
					var lin = revfl[l] & 31, din = revfd[d] & 31;
					eb += fleb[lin] + fdeb[din];
					++lf[257 + lin];
					++df[din];
					wi = i + l;
					++lc_1;
				} else {
					syms[li++] = dat[i];
					++lf[dat[i]];
				}
			}
		}
		pos = wblk(dat, w, lst, syms, lf, df, eb, li, bs, i - bs, pos);
		if (!lst && pos & 7) pos = wfblk(w, pos + 1, et);
	}
	return slc(o, 0, pre + shft(pos) + post);
};
var crct = /* @__PURE__ */ (function() {
	var t = new Int32Array(256);
	for (var i = 0; i < 256; ++i) {
		var c = i, k = 9;
		while (--k) c = (c & 1 && -306674912) ^ c >>> 1;
		t[i] = c;
	}
	return t;
})();
var crc = function() {
	var c = -1;
	return {
		p: function(d) {
			var cr = c;
			for (var i = 0; i < d.length; ++i) cr = crct[cr & 255 ^ d[i]] ^ cr >>> 8;
			c = cr;
		},
		d: function() {
			return ~c;
		}
	};
};
var dopt = function(dat, opt, pre, post, st) {
	return dflt(dat, opt.level == null ? 6 : opt.level, opt.mem == null ? Math.ceil(Math.max(8, Math.min(13, Math.log(dat.length))) * 1.5) : 12 + opt.mem, pre, post, !st);
};
var mrg = function(a, b) {
	var o = {};
	for (var k in a) o[k] = a[k];
	for (var k in b) o[k] = b[k];
	return o;
};
var b2 = function(d, b) {
	return d[b] | d[b + 1] << 8;
};
var b4 = function(d, b) {
	return (d[b] | d[b + 1] << 8 | d[b + 2] << 16 | d[b + 3] << 24) >>> 0;
};
var b8 = function(d, b) {
	return b4(d, b) + b4(d, b + 4) * 4294967296;
};
var wbytes = function(d, b, v) {
	for (; v; ++b) d[b] = v, v >>>= 8;
};
/**
* Compresses data with DEFLATE without any wrapper
* @param data The data to compress
* @param opts The compression options
* @returns The deflated version of the data
*/
function deflateSync(data, opts) {
	return dopt(data, opts || {}, 0, 0);
}
/**
* Expands DEFLATE data with no wrapper
* @param data The data to decompress
* @param out Where to write the data. Saves memory if you know the decompressed size and provide an output buffer of that length.
* @returns The decompressed version of the data
*/
function inflateSync(data, out) {
	return inflt(data, out);
}
var fltn = function(d, p, t, o) {
	for (var k in d) {
		var val = d[k], n = p + k, op = o;
		if (Array.isArray(val)) op = mrg(o, val[1]), val = val[0];
		if (val instanceof u8) t[n] = [val, op];
		else {
			t[n += "/"] = [new u8(0), op];
			fltn(val, n, t, o);
		}
	}
};
var te = typeof TextEncoder != "undefined" && /* @__PURE__ */ new TextEncoder();
var td = typeof TextDecoder != "undefined" && /* @__PURE__ */ new TextDecoder();
try {
	td.decode(et, { stream: true });
} catch (e) {}
var dutf8 = function(d) {
	for (var r = "", i = 0;;) {
		var c = d[i++];
		var eb = (c > 127) + (c > 223) + (c > 239);
		if (i + eb > d.length) return [r, slc(d, i - 1)];
		if (!eb) r += String.fromCharCode(c);
		else if (eb == 3) c = ((c & 15) << 18 | (d[i++] & 63) << 12 | (d[i++] & 63) << 6 | d[i++] & 63) - 65536, r += String.fromCharCode(55296 | c >> 10, 56320 | c & 1023);
		else if (eb & 1) r += String.fromCharCode((c & 31) << 6 | d[i++] & 63);
		else r += String.fromCharCode((c & 15) << 12 | (d[i++] & 63) << 6 | d[i++] & 63);
	}
};
/**
* Converts a string into a Uint8Array for use with compression/decompression methods
* @param str The string to encode
* @param latin1 Whether or not to interpret the data as Latin-1. This should
*               not need to be true unless decoding a binary string.
* @returns The string encoded in UTF-8/Latin-1 binary
*/
function strToU8(str, latin1) {
	if (latin1) {
		var ar_1 = new u8(str.length);
		for (var i = 0; i < str.length; ++i) ar_1[i] = str.charCodeAt(i);
		return ar_1;
	}
	if (te) return te.encode(str);
	var l = str.length;
	var ar = new u8(str.length + (str.length >> 1));
	var ai = 0;
	var w = function(v) {
		ar[ai++] = v;
	};
	for (var i = 0; i < l; ++i) {
		if (ai + 5 > ar.length) {
			var n = new u8(ai + 8 + (l - i << 1));
			n.set(ar);
			ar = n;
		}
		var c = str.charCodeAt(i);
		if (c < 128 || latin1) w(c);
		else if (c < 2048) w(192 | c >> 6), w(128 | c & 63);
		else if (c > 55295 && c < 57344) c = 65536 + (c & 1047552) | str.charCodeAt(++i) & 1023, w(240 | c >> 18), w(128 | c >> 12 & 63), w(128 | c >> 6 & 63), w(128 | c & 63);
		else w(224 | c >> 12), w(128 | c >> 6 & 63), w(128 | c & 63);
	}
	return slc(ar, 0, ai);
}
/**
* Converts a Uint8Array to a string
* @param dat The data to decode to string
* @param latin1 Whether or not to interpret the data as Latin-1. This should
*               not need to be true unless encoding to binary string.
* @returns The original UTF-8/Latin-1 string
*/
function strFromU8(dat, latin1) {
	if (latin1) {
		var r = "";
		for (var i = 0; i < dat.length; i += 16384) r += String.fromCharCode.apply(null, dat.subarray(i, i + 16384));
		return r;
	} else if (td) return td.decode(dat);
	else {
		var _a = dutf8(dat), out = _a[0];
		if (_a[1].length) err(8);
		return out;
	}
}
var slzh = function(d, b) {
	return b + 30 + b2(d, b + 26) + b2(d, b + 28);
};
var zh = function(d, b, z) {
	var fnl = b2(d, b + 28), fn = strFromU8(d.subarray(b + 46, b + 46 + fnl), !(b2(d, b + 8) & 2048)), es = b + 46 + fnl, bs = b4(d, b + 20);
	var _a = z && bs == 4294967295 ? z64e(d, es) : [
		bs,
		b4(d, b + 24),
		b4(d, b + 42)
	], sc = _a[0], su = _a[1], off = _a[2];
	return [
		b2(d, b + 10),
		sc,
		su,
		fn,
		es + b2(d, b + 30) + b2(d, b + 32),
		off
	];
};
var z64e = function(d, b) {
	for (; b2(d, b) != 1; b += 4 + b2(d, b + 2));
	return [
		b8(d, b + 12),
		b8(d, b + 4),
		b8(d, b + 20)
	];
};
var exfl = function(ex) {
	var le = 0;
	if (ex) for (var k in ex) {
		var l = ex[k].length;
		if (l > 65535) err(9);
		le += l + 4;
	}
	return le;
};
var wzh = function(d, b, f, fn, u, c, ce, co) {
	var fl = fn.length, ex = f.extra, col = co && co.length;
	var exl = exfl(ex);
	wbytes(d, b, ce != null ? 33639248 : 67324752), b += 4;
	if (ce != null) d[b++] = 20, d[b++] = f.os;
	d[b] = 20, b += 2;
	d[b++] = f.flag << 1 | (c < 0 && 8), d[b++] = u && 8;
	d[b++] = f.compression & 255, d[b++] = f.compression >> 8;
	var dt = new Date(f.mtime == null ? Date.now() : f.mtime), y = dt.getFullYear() - 1980;
	if (y < 0 || y > 119) err(10);
	wbytes(d, b, y << 25 | dt.getMonth() + 1 << 21 | dt.getDate() << 16 | dt.getHours() << 11 | dt.getMinutes() << 5 | dt.getSeconds() >>> 1), b += 4;
	if (c != -1) {
		wbytes(d, b, f.crc);
		wbytes(d, b + 4, c < 0 ? -c - 2 : c);
		wbytes(d, b + 8, f.size);
	}
	wbytes(d, b + 12, fl);
	wbytes(d, b + 14, exl), b += 16;
	if (ce != null) {
		wbytes(d, b, col);
		wbytes(d, b + 6, f.attrs);
		wbytes(d, b + 10, ce), b += 14;
	}
	d.set(fn, b);
	b += fl;
	if (exl) for (var k in ex) {
		var exf = ex[k], l = exf.length;
		wbytes(d, b, +k);
		wbytes(d, b + 2, l);
		d.set(exf, b + 4), b += 4 + l;
	}
	if (col) d.set(co, b), b += col;
	return b;
};
var wzf = function(o, b, c, d, e) {
	wbytes(o, b, 101010256);
	wbytes(o, b + 8, c);
	wbytes(o, b + 10, c);
	wbytes(o, b + 12, d);
	wbytes(o, b + 16, e);
};
/**
* Synchronously creates a ZIP file. Prefer using `zip` for better performance
* with more than one file.
* @param data The directory structure for the ZIP archive
* @param opts The main options, merged with per-file options
* @returns The generated ZIP archive
*/
function zipSync(data, opts) {
	if (!opts) opts = {};
	var r = {};
	var files = [];
	fltn(data, "", r, opts);
	var o = 0;
	var tot = 0;
	for (var fn in r) {
		var _a = r[fn], file = _a[0], p = _a[1];
		var compression = p.level == 0 ? 0 : 8;
		var f = strToU8(fn), s = f.length;
		var com = p.comment, m = com && strToU8(com), ms = m && m.length;
		var exl = exfl(p.extra);
		if (s > 65535) err(11);
		var d = compression ? deflateSync(file, p) : file, l = d.length;
		var c = crc();
		c.p(file);
		files.push(mrg(p, {
			size: file.length,
			crc: c.d(),
			c: d,
			f,
			m,
			u: s != fn.length || m && com.length != ms,
			o,
			compression
		}));
		o += 30 + s + exl + l;
		tot += 76 + 2 * (s + exl) + (ms || 0) + l;
	}
	var out = new u8(tot + 22), oe = o, cdl = tot - o;
	for (var i = 0; i < files.length; ++i) {
		var f = files[i];
		wzh(out, f.o, f, f.f, f.u, f.c.length);
		var badd = 30 + f.f.length + exfl(f.extra);
		out.set(f.c, f.o + badd);
		wzh(out, o, f, f.f, f.u, f.c.length, f.o, f.m), o += 16 + badd + (f.m ? f.m.length : 0);
	}
	wzf(out, o, files.length, cdl, oe);
	return out;
}
/**
* Synchronously decompresses a ZIP archive. Prefer using `unzip` for better
* performance with more than one file.
* @param data The raw compressed ZIP file
* @param opts The ZIP extraction options
* @returns The decompressed files
*/
function unzipSync(data, opts) {
	var files = {};
	var e = data.length - 22;
	for (; b4(data, e) != 101010256; --e) if (!e || data.length - e > 65558) err(13);
	var c = b2(data, e + 8);
	if (!c) return {};
	var o = b4(data, e + 16);
	var z = o == 4294967295 || c == 65535;
	if (z) {
		var ze = b4(data, e - 12);
		z = b4(data, ze) == 101075792;
		if (z) {
			c = b4(data, ze + 32);
			o = b4(data, ze + 48);
		}
	}
	var fltr = opts && opts.filter;
	for (var i = 0; i < c; ++i) {
		var _a = zh(data, o, z), c_2 = _a[0], sc = _a[1], su = _a[2], fn = _a[3], no = _a[4], off = _a[5], b = slzh(data, off);
		o = no;
		if (!fltr || fltr({
			name: fn,
			size: sc,
			originalSize: su,
			compression: c_2
		})) if (!c_2) files[fn] = slc(data, b, b + sc);
		else if (c_2 == 8) files[fn] = inflateSync(data.subarray(b, b + sc), new u8(su));
		else err(14, "unknown compression type " + c_2);
	}
	return files;
}
//#endregion
//#region lib/qc-offline-excel.ts
var META = "__QC_DATA", MARKER = "CUBOID_QC_RESULT_V1";
var key = (s) => /^\d+$/.test(s) ? BigInt(s).toString() : s;
function encode(value) {
	const bytes = strToU8(value), parts = [];
	for (let i = 0; i < bytes.length; i += 12288) parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 12288))));
	return parts.join("");
}
function offlineWorkbookSheets(input, context) {
	const result = offlineResultSchema.parse(input), frames = result.source.frames, marks = new Map((result.marks || []).map((m) => [key(m.objectId) + ":" + m.frame, m.codes]));
	const styles = [], rows = [];
	for (const c of result.checks) {
		const present = new Set(c.present), style = [
			0,
			0,
			c.logs.length ? 6 : 5
		], row = [
			c.objectId,
			c.label,
			c.logs.length ? "Có lỗi" : "Đạt"
		];
		for (const f of frames) {
			const warning = marks.get(key(c.objectId) + ":" + f) || "", logged = c.logs.some((l) => f >= l.frameStart && f <= l.frameEnd);
			row.push(warning + (logged ? "L" : ""));
			style.push(logged ? warning ? 13 : 12 : warning ? warning.length > 1 ? 10 : 9 : present.has(f) ? 8 : 0);
		}
		rows.push(row);
		styles.push(style);
	}
	const job = context?.jobId || (result.source.kind === "blank" ? result.source.jobId : ""), date = new Date(result.completedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
	const metadata = encode(JSON.stringify(result)), chunks = Array.from({ length: Math.ceil(metadata.length / 3e4) }, (_, i) => [metadata.slice(i * 3e4, (i + 1) * 3e4)]);
	return [
		{
			name: "Matrix",
			rows: [[
				"Object ID",
				"Nhãn",
				"Trạng thái",
				...frames.map(String)
			], ...rows],
			widths: [
				14,
				20,
				18,
				...frames.map(() => 6)
			],
			freezeColumns: 3,
			matrixStyle: (r, c) => styles[r]?.[c]
		},
		{
			name: "Log QC",
			rows: [[
				"Object ID",
				"Từ frame",
				"Đến frame",
				"Giải thích lỗi",
				"Hướng giải quyết"
			], ...result.checks.flatMap((c) => c.logs.map((l) => [
				c.objectId,
				l.frameStart,
				l.frameEnd,
				l.description,
				l.solution
			]))],
			widths: [
				14,
				12,
				12,
				90,
				80
			],
			freezeColumns: 1,
			maxRowHeight: 409
		},
		{
			name: "QC tung ID",
			rows: [[
				"Object ID",
				"Kết quả QC",
				"Số log",
				"Thời điểm QC"
			], ...result.checks.map((c) => [
				c.objectId,
				c.logs.length ? "Có lỗi" : "Đạt",
				c.logs.length,
				new Date(c.doneAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
			])],
			widths: [
				14,
				20,
				12,
				26
			],
			freezeColumns: 1
		},
		{
			name: "Huong dan",
			rows: [
				["Nội dung", "Chi tiết"],
				["Job ID", job || "Chọn Job khi tải kết quả lên web"],
				["Annotator", context?.assigneeName || ""],
				["Người QC", context?.reviewerName || ""],
				["Nguồn", result.source.kind === "blank" ? "Bảng trắng" : result.source.name],
				["Hoàn tất QC", date],
				["Số ID / log", result.checks.length + " ID / " + result.checks.reduce((n, c) => n + c.logs.length, 0) + " log"],
				["Log phạm vi", "Mỗi dòng Log QC áp dụng cho toàn bộ Từ frame–Đến frame."],
				["L", "Log lỗi do người QC ghi."],
				["S / K / Z / H / O / D", "Cảnh báo scale, kích thước, cao độ, hướng, chồng lấn và khoảng cách."],
				["Nền xanh nhạt", "Object xuất hiện ở frame; không có cảnh báo."],
				["Nền vàng / cam", "Cảnh báo tự động cần người QC đối chiếu."],
				["Viền đỏ", "Frame đã có log QC."],
				["Minh chứng", "Tải chính file Excel này lên Job tương ứng trên web."]
			],
			widths: [25, 90]
		},
		{
			name: META,
			rows: [[MARKER], ...chunks],
			widths: [30],
			hidden: true
		}
	];
}
function offlineWorkbook(result, context) {
	return zipSync(unzipSync(xlsx(offlineWorkbookSheets(result, context))), { level: 6 });
}
//#endregion
//#region lib/hub-http.ts
var responseHeaders = {
	"Cache-Control": "private, no-store",
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "same-origin"
};
var json$3 = (value, status = 200) => Response.json(value, {
	status,
	headers: responseHeaders
});
async function boundedBody(req, limit) {
	ensure(Number(req.headers.get("Content-Length") || 0) <= limit, "Yêu cầu quá lớn", 413);
	const reader = req.body?.getReader();
	ensure(reader, "Thiếu nội dung yêu cầu");
	const chunks = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.length;
		if (size > limit) {
			await reader.cancel();
			throw new HubError("Yêu cầu quá lớn", 413);
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(size);
	let pos = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, pos);
		pos += chunk.length;
	}
	return bytes;
}
async function readJson$1(req, limit = 1024 * 1024) {
	try {
		return JSON.parse(new TextDecoder().decode(await boundedBody(req, limit)));
	} catch (e) {
		if (e instanceof HubError) throw e;
		throw new HubError("JSON không hợp lệ");
	}
}
async function handleHub(req, env) {
	try {
		ensure(env.DB, "Cơ sở dữ liệu chưa được kết nối", 503);
		const identity = await env.authenticate(req);
		ensure(identity, "Vui lòng đăng nhập", 401);
		const hub = new Hub(env.DB, env.LEAD_EMAIL || "", env.now?.() || /* @__PURE__ */ new Date());
		const url = new URL(req.url);
		const action = url.pathname.split("/api/hub/")[1];
		if (req.method !== "GET") {
			ensure(req.headers.get("Origin") === url.origin, "Yêu cầu không cùng nguồn", 403);
			ensure(req.headers.get("Sec-Fetch-Site") !== "cross-site", "Yêu cầu không hợp lệ", 403);
		}
		if (req.method === "GET" && action === "state") return json$3(await hub.state(identity));
		if (req.method === "POST" && action === "setup") return json$3(await hub.setup(identity));
		if (req.method === "POST" && action === "activate") return json$3(await hub.activate(identity));
		const me = await hub.current(identity);
		await hub.ensureAttendanceDefaults();
		if (req.method === "GET" && action === "qc-offline-export") {
			const sessionId = url.searchParams.get("id") || "";
			ensure((await hub.visible(me)).some((r) => r.id === sessionId && r.kind === "qc-session"), "Không có quyền xem log này", 403);
			const session = await hub.get(sessionId, "qc-session"), result = session.data.offlineResult;
			ensure(result, "Phiên không có file QC offline", 404);
			const format = url.searchParams.get("format"), excel = format === "xlsx", csvFormat = format === "csv";
			return new Response(excel ? offlineWorkbook(result, session.data.offlineContext) : csvFormat ? offlineCsv(result, session.data.offlineContext) : JSON.stringify(result, null, 2), { headers: {
				...responseHeaders,
				"Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : csvFormat ? "text/csv;charset=utf-8" : "application/json",
				"Content-Disposition": `attachment; filename="Job-${session.data.jobId || "QC"}.qc-result.${excel ? "xlsx" : csvFormat ? "csv" : "json"}"`
			} });
		}
		if (req.method === "GET" && action === "kpi-summary") return json$3(await hub.kpiSummary(me, url.searchParams.get("period") || void 0, url.searchParams.get("member") || void 0));
		if (req.method === "GET" && action === "evaluation") return json$3(await hub.evaluation(me, Object.fromEntries(url.searchParams)));
		if (req.method === "GET" && action === "weekly-summary") return json$3(await hub.weeklySummary(me, url.searchParams.get("member") || (me.role === "Lead" ? "team" : me.id), url.searchParams.get("week") || today(hub.now)));
		if (req.method === "GET" && action === "aggregate") return json$3(await hub.aggregate(me, url.searchParams.get("member") || me.id, url.searchParams.get("week") || today()));
		if (req.method === "GET" && action === "export") {
			const kind = url.searchParams.get("kind") || "task";
			if (kind === "weekly-summary") {
				const data = await hub.weeklySummary(me, url.searchParams.get("member") || (me.role === "Lead" ? "team" : me.id), url.searchParams.get("week") || today(hub.now)), sheets = weeklySummarySheets(data), excel = url.searchParams.get("format") === "xlsx";
				await hub.db.batch([hub.audit(me.id, "Xuất Weekly Report từ Daily Report", "weekly-summary", null, {
					start: data.start,
					end: data.end,
					asOf: data.asOf,
					members: data.rows.length
				})]);
				return new Response(excel ? xlsx(sheets) : csv(sheets[0].rows), { headers: {
					...responseHeaders,
					"Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8",
					"Content-Disposition": `attachment; filename="Weekly_Report_${data.start}_${data.end}.${excel ? "xlsx" : "csv"}"`
				} });
			}
			if (kind === "evaluation") {
				const result = await hub.evaluation(me, Object.fromEntries(url.searchParams)), sheets = evaluationSheets(result), excel = url.searchParams.get("format") === "xlsx";
				await hub.db.batch([hub.audit(me.id, "Xuất đánh giá team", "evaluation", null, {
					from: result.from,
					to: result.to,
					members: result.rows.length
				})]);
				return new Response(excel ? xlsx(sheets) : csv(sheets[0].rows), { headers: {
					...responseHeaders,
					"Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8",
					"Content-Disposition": `attachment; filename="cuboid-evaluation-${result.from}-${result.to}.${excel ? "xlsx" : "csv"}"`
				} });
			}
			ensure([
				"task",
				"daily",
				"weekly",
				"attendance",
				"review",
				"target",
				"morning",
				"qc-session"
			].includes(kind), "Loại xuất không hợp lệ");
			const visible = await hub.visible(me);
			const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
			const morningDate = url.searchParams.get("date") || today();
			if (kind === "morning") ensure(validDay(morningDate), "Ngày báo cáo sáng không hợp lệ");
			const productionDate = kind === "morning" ? url.searchParams.get("productionDate") || previousWorkday(morningDate, await hub.settings()) : "";
			if (kind === "morning") ensure(validDay(morningDate) && validDay(productionDate) && productionDate < morningDate, "Ngày báo cáo sáng hoặc ngày sản lượng không hợp lệ");
			let records = visible.filter((r) => r.kind === (kind === "morning" ? "daily" : kind));
			const personalDaily = kind === "daily" && (me.role !== "Lead" || url.searchParams.get("scope") === "mine");
			if (personalDaily) records = records.filter((r) => r.owner_id === me.id);
			if (kind === "morning") records = records.filter((r) => r.date === productionDate && [
				"submitted",
				"approved",
				"imported"
			].includes(r.status));
			for (const [param, field] of [
				["project", "project_id"],
				["member", "owner_id"],
				["status", "status"]
			]) {
				const v = url.searchParams.get(param);
				if (v && field === "project_id" && kind === "daily") records = records.map((r) => ({
					...r,
					data: {
						...r.data,
						scoped: true,
						lines: r.data.lines.filter((l) => visible.find((t) => t.id === l.taskId)?.project_id === v)
					}
				})).filter((r) => r.data.lines.length);
				else if (v) records = records.filter((r) => field === "status" && v === "overdue" ? r.kind === "task" && r.status !== "done" && r.data.deadline && r.data.deadline < today() : field === "owner_id" && kind === "task" ? r.data.assigneeId === v : r[field] === v);
			}
			const from = url.searchParams.get("from"), to = url.searchParams.get("to"), search = url.searchParams.get("q")?.toLowerCase();
			records = records.filter((r) => (!from || (r.date || r.data.assignedDate || r.created_at.slice(0, 10)) >= from) && (!to || (r.date || r.data.assignedDate || r.created_at.slice(0, 10)) <= to) && (!search || JSON.stringify(r.data).toLowerCase().includes(search)));
			const members = await hub.members(), all = await hub.visible(me), weekly = {};
			if (kind === "weekly") {
				for (const r of records) if (!r.data.snapshot) weekly[r.id] = await hub.aggregate(me, r.owner_id, r.date);
			}
			const kpiMembers = members.filter((m) => m.state === "active" && (m.role !== "Lead" || records.some((r) => r.owner_id === m.id)) && (me.role === "Lead" && !personalDaily || m.id === me.id) && (!url.searchParams.get("member") || m.id === url.searchParams.get("member")));
			const kpiPeriod = url.searchParams.get("kpiPeriod") || (me.role === "Lead" ? "cumulative" : "weekly");
			ensure(["weekly", "cumulative"].includes(kpiPeriod), "Kỳ KPI không hợp lệ");
			ensure(kpiPeriod !== "cumulative" || me.role === "Lead", "Chỉ Lead được xem KPI lũy kế", 403);
			const sheets = reportSheets(kind, records, all, members, weekly, {
				kpiMembers,
				kpiPeriod,
				asOf: to || today(hub.now),
				morningDate,
				productionDate
			});
			const excel = url.searchParams.get("format") === "xlsx";
			await hub.db.batch([hub.audit(me.id, "Xuất báo cáo " + kind, "export", null, {
				count: records.length,
				filters: Object.fromEntries(url.searchParams)
			})]);
			return new Response(excel ? xlsx(sheets) : csv(sheets[0].rows), { headers: {
				...responseHeaders,
				"Content-Type": excel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv;charset=utf-8",
				"Content-Disposition": `attachment; filename="cuboid-${kind}-${kind === "morning" ? morningDate : today()}.${excel ? "xlsx" : "csv"}"`
			} });
		}
		if (req.method === "GET" && action === "backup") {
			hub.lead(me);
			const snapshot = {
				format: "cuboid-hub-v1",
				project: "appgprj_6ad97f484fe481919887bf7a05f76782",
				...env.backupExtra,
				createdAt: hub.stamp(),
				members: await hub.members(),
				records: await hub.rows(),
				audit: (await hub.db.prepare("SELECT * FROM audit ORDER BY created_at").all()).results
			};
			return new Response(JSON.stringify(snapshot), { headers: {
				...responseHeaders,
				"Content-Type": "application/json",
				"Content-Disposition": `attachment; filename="cuboid-backup-${today()}.json"`
			} });
		}
		if (req.method === "POST" && action === "restore") {
			hub.attendanceLead(me);
			const b = await readJson$1(req, 15 * 1024 * 1024);
			ensure(b.confirm === "KHOI PHUC", "Cần xác nhận khôi phục");
			const snap = b.snapshot;
			ensure(snap?.format === "cuboid-hub-v1" && snap.project === "appgprj_6ad97f484fe481919887bf7a05f76782", "Bản sao lưu không thuộc ứng dụng này");
			ensure(Array.isArray(snap.records) && Array.isArray(snap.members) && snap.records.length <= 5e4, "Bản sao lưu không hợp lệ");
			ensure(snap.members.some((x) => x.id === me.id && x.auth_id === me.auth_id && x.role === "Lead" && x.state === "active"), "Bản sao lưu phải giữ tài khoản Lead hiện tại");
			const allowed = [
				"project",
				"task",
				"daily",
				"weekly",
				"attendance",
				"request",
				"review",
				"document",
				"settings",
				"kpi-exclusion",
				"kpi-rate",
				"target",
				"comment",
				"notification",
				"file",
				"import",
				"legacy",
				"qc-session",
				"qc-assignment",
				"qc-basic",
				"kpi-count",
				"kpi-source",
				"manual-rework",
				"weekly-snapshot",
				"qa-question",
				"qa-answer"
			];
			const stmts = [hub.db.prepare("DELETE FROM records"), hub.db.prepare("DELETE FROM members")];
			for (const m of snap.members) {
				objectType({
					id: stringType(),
					name: stringType(),
					email: stringType().email(),
					role: enumType([
						"Lead",
						"QA/QC",
						"Annotator"
					]),
					state: enumType([
						"pending",
						"invited",
						"active",
						"disabled"
					])
				}).parse(m);
				stmts.push(hub.db.prepare("INSERT INTO members(id,name,email,auth_id,role,state,invite_expires,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(m.id, m.name, m.email, m.auth_id, m.role, m.state, m.invite_expires, m.created_at));
			}
			for (const r of snap.records) {
				ensure(allowed.includes(r.kind) && typeof r.id === "string" && r.data && typeof r.data === "object", "Dữ liệu sao lưu bị lỗi");
				stmts.push(hub.db.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(r.id, r.kind, r.natural_key, r.owner_id, r.project_id, r.task_id, r.date, r.status, r.revision, JSON.stringify(r.data), r.created_at, r.updated_at));
			}
			stmts.push(hub.audit(me.id, "Khôi phục dữ liệu", "backup", null, {
				backupAt: snap.createdAt,
				records: snap.records.length
			}));
			await hub.db.batch(stmts);
			return json$3({ ok: true });
		}
		if (req.method === "POST" && action === "upload") {
			ensure(env.BUCKET, "Kho tệp chưa được kết nối", 503);
			const bytes = await boundedBody(req, 11 * 1024 * 1024);
			const form = await new Response(bytes, { headers: { "Content-Type": req.headers.get("Content-Type") || "" } }).formData();
			const file = form.get("file");
			const entityId = String(form.get("entityId") || "");
			ensure(file && typeof file.arrayBuffer === "function" && file.size > 0 && file.size <= 10 * 1024 * 1024, "Tệp tối đa 10 MB");
			ensure((await hub.visible(me)).some((r) => r.id === entityId && [
				"task",
				"daily",
				"weekly"
			].includes(r.kind)), "Không có quyền đính kèm vào bản ghi này", 403);
			const entity = await hub.get(entityId);
			ensure(me.role === "Lead" || (entity.kind === "task" ? hub.canTask(me, entity) : entity.kind === "daily" ? dailyReportWritable(me, entity.owner_id, entity.date, hub.now, (await hub.settings()).reportDeadline) : entity.owner_id === me.id && [
				"draft",
				"changes",
				"imported"
			].includes(entity.status)), "Bản ghi đã khóa hoặc bạn không có quyền", 403);
			const key = "files/" + crypto.randomUUID();
			await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: "application/octet-stream" } });
			try {
				await hub.commit(me, "Tải tệp minh chứng", null, "file", {
					name: file.name.slice(0, 240),
					size: file.size,
					key,
					entityId
				}, { owner_id: me.id });
			} catch (e) {
				await env.BUCKET.delete(key);
				throw e;
			}
			return json$3({ ok: true });
		}
		if (req.method === "GET" && action.startsWith("file/")) {
			const file = await hub.get(action.slice(5), "file");
			ensure((await hub.visible(me)).some((r) => r.id === file.id), "Không có quyền truy cập tệp", 403);
			ensure(env.BUCKET, "Kho tệp chưa sẵn sàng", 503);
			const blob = await env.BUCKET.get(file.data.key);
			ensure(blob, "Không tìm thấy tệp. Cần khôi phục tệp R2 từ bản sao lưu.", 404);
			return new Response(blob.body, { headers: {
				...responseHeaders,
				"Content-Type": "application/octet-stream",
				"Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.data.name)}`
			} });
		}
		if (req.method === "POST") {
			const body = await readJson$1(req, action === "qc-offline-import" ? 15 * 1024 * 1024 : 1024 * 1024);
			const result = await hub.mutate(me, action, body);
			return json$3(env.afterMutation ? await env.afterMutation(action, result, me, body, req) : result);
		}
		return json$3({ error: "Không tìm thấy" }, 404);
	} catch (e) {
		if (e instanceof HubError) return json$3({ error: e.message }, e.status);
		if (e instanceof ZodError) return json$3({ error: e.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ") }, 400);
		if (/constraint|UNIQUE|NOT NULL/i.test(e?.message || "")) return json$3({ error: "Dữ liệu đã thay đổi hoặc bị trùng. Tải lại rồi thử lại." }, 409);
		console.error("Hub API failure", e?.message);
		return json$3({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
	}
}
//#endregion
//#region self-host/sqlite.ts
var Query = class Query {
	constructor(db, sql, args = []) {
		this.db = db;
		this.sql = sql;
		this.args = args;
	}
	bind(...args) {
		return new Query(this.db, this.sql, args);
	}
	async all() {
		return { results: this.db.prepare(this.sql).all(...this.args) };
	}
	async first() {
		return this.db.prepare(this.sql).get(...this.args) || null;
	}
	execute() {
		const r = this.db.prepare(this.sql).run(...this.args);
		return { meta: { changes: Number(r.changes) } };
	}
	async run() {
		return this.execute();
	}
};
var SqliteStore = class {
	constructor(file, schema) {
		if (file !== ":memory:") mkdirSync(dirname(file), {
			recursive: true,
			mode: 448
		});
		this.sql = new DatabaseSync(file, { timeout: 5e3 });
		this.sql.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;");
		this.sql.exec("CREATE TABLE IF NOT EXISTS selfhost_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
		if (!this.sql.prepare("SELECT 1 FROM selfhost_meta WHERE key='schema_v1'").get()) this.transaction(() => {
			this.sql.exec(schema);
			this.sql.prepare("INSERT INTO selfhost_meta VALUES('schema_v1','1')").run();
		});
		this.sql.exec(`CREATE TABLE IF NOT EXISTS auth_credentials(member_id TEXT PRIMARY KEY REFERENCES members(id),password_hash TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_sessions(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),credential_version INTEGER NOT NULL,expires_at INTEGER NOT NULL,last_seen INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),purpose TEXT NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER);
      CREATE TABLE IF NOT EXISTS auth_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS members_handle_unique ON members(lower(substr(email,1,instr(email,'@')-1)));`);
	}
	prepare(sql) {
		return new Query(this.sql, sql);
	}
	transaction(fn) {
		this.sql.exec("BEGIN IMMEDIATE");
		try {
			const result = fn();
			this.sql.exec("COMMIT");
			return result;
		} catch (e) {
			this.sql.exec("ROLLBACK");
			throw e;
		}
	}
	async batch(statements) {
		return this.transaction(() => statements.map((s) => s.execute()));
	}
	close() {
		this.sql.close();
	}
};
//#endregion
//#region self-host/auth.ts
var hashToken = (value) => createHash("sha256").update(value).digest("hex");
var freshToken = () => randomBytes(32).toString("base64url");
var hashJobs = 0;
async function derive(password, salt) {
	ensure(hashJobs < 3, "Đang xử lý đăng nhập. Vui lòng thử lại sau vài giây.", 429);
	hashJobs++;
	try {
		return await new Promise((resolve, reject) => scrypt(password, salt, 64, {
			N: 32768,
			r: 8,
			p: 1,
			maxmem: 64 * 1024 * 1024
		}, (e, key) => e ? reject(e) : resolve(key)));
	} finally {
		hashJobs--;
	}
}
function validatePassword(password) {
	ensure(typeof password === "string" && password.length >= 3 && password.length <= 128, "Mật khẩu cần từ 3 đến 128 ký tự.");
}
async function passwordHash(password) {
	validatePassword(password);
	const salt = randomBytes(16);
	return `scrypt-v1:${salt.toString("hex")}:${(await derive(password, salt)).toString("hex")}`;
}
async function passwordMatches(password, stored) {
	const [version, salt, digest] = stored.split(":");
	if (version !== "scrypt-v1" || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(digest)) return false;
	return timingSafeEqual(await derive(password, Buffer.from(salt, "hex")), Buffer.from(digest, "hex"));
}
function cookieValue(req, name) {
	return req.headers.get("cookie")?.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + "="))?.slice(name.length + 1) || "";
}
var sessionCookie = (token, secure, maxAge = 12 * 3600) => `cuboid_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
var LocalAuth = class {
	constructor(store) {
		this.store = store;
		this.dummyHash = "";
	}
	async initialize() {
		this.dummyHash = await passwordHash(freshToken());
		this.cleanup();
	}
	cleanup() {
		const now = Date.now();
		this.store.sql.prepare("DELETE FROM auth_sessions WHERE expires_at<? OR last_seen<?").run(now, now - 2 * 36e5);
		this.store.sql.prepare("DELETE FROM auth_tokens WHERE expires_at<?").run(now);
		this.store.sql.prepare("DELETE FROM auth_limits WHERE expires_at<?").run(now);
	}
	isSetup() {
		return !!this.store.sql.prepare("SELECT 1 FROM auth_credentials WHERE member_id='member-0'").get();
	}
	limit(key, max, windowMs = 15 * 6e4) {
		const hash = hashToken(key), now = Date.now();
		ensure(this.store.sql.prepare("INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count").get(hash, now + windowMs, now, now).count <= max, "Đã thử quá nhiều lần. Vui lòng chờ 15 phút rồi thử lại.", 429);
	}
	async current(req) {
		const token = cookieValue(req, "cuboid_session");
		if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
		const now = Date.now();
		const row = this.store.sql.prepare(`SELECT m.*,c.version AS credential_version FROM auth_sessions s JOIN members m ON m.id=s.member_id JOIN auth_credentials c ON c.member_id=m.id WHERE s.token_hash=? AND s.expires_at>? AND s.last_seen>? AND s.credential_version=c.version AND m.state='active'`).get(hashToken(token), now, now - 2 * 36e5);
		if (!row) return null;
		this.store.sql.prepare("UPDATE auth_sessions SET last_seen=? WHERE token_hash=?").run(now, hashToken(token));
		return row;
	}
	session(memberId) {
		const credential = this.store.sql.prepare("SELECT version FROM auth_credentials WHERE member_id=?").get(memberId);
		ensure(credential, "Tài khoản chưa đặt mật khẩu", 403);
		const token = freshToken(), now = Date.now();
		this.store.sql.prepare("INSERT INTO auth_sessions VALUES(?,?,?,?,?)").run(hashToken(token), memberId, credential.version, now + 12 * 36e5, now);
		return token;
	}
	async login(username, password, ip) {
		ensure(typeof username === "string" && username.length <= 254 && typeof password === "string" && password.length <= 128, "Thông tin đăng nhập không hợp lệ");
		const handle = username.trim().toLowerCase();
		this.limit("login-user:" + handle, 12);
		this.limit("login-ip:" + ip, 100);
		const row = this.store.sql.prepare(`SELECT m.*,c.password_hash FROM members m LEFT JOIN auth_credentials c ON c.member_id=m.id WHERE lower(m.email)=? OR lower(substr(m.email,1,instr(m.email,'@')-1))=?`).get(handle, handle);
		ensure(await passwordMatches(password, row?.password_hash || this.dummyHash) && row?.state === "active" && row?.password_hash, "Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản chưa được kích hoạt.", 401);
		const hub = new Hub(this.store, "");
		await this.store.batch([hub.audit(row.id, "Đăng nhập bằng mật khẩu", row.id, null, null)]);
		return {
			token: this.session(row.id),
			member: row
		};
	}
	logout(req) {
		this.store.sql.prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hashToken(cookieValue(req, "cuboid_session")));
	}
	issue(memberId, purpose, hours) {
		const token = freshToken(), expires = Date.now() + hours * 36e5;
		this.store.transaction(() => {
			this.store.sql.prepare("DELETE FROM auth_tokens WHERE member_id=? AND purpose=?").run(memberId, purpose);
			this.store.sql.prepare("INSERT INTO auth_tokens VALUES(?,?,?,?,NULL)").run(hashToken(token), memberId, purpose, expires);
		});
		return {
			token,
			expires: new Date(expires).toISOString()
		};
	}
	tokenInfo(token) {
		ensure(/^[A-Za-z0-9_-]{43}$/.test(token), "Liên kết không hợp lệ hoặc đã hết hạn", 400);
		const row = this.store.sql.prepare(`SELECT t.*,m.name,m.email,m.state FROM auth_tokens t JOIN members m ON m.id=t.member_id WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?`).get(hashToken(token), Date.now());
		ensure(row && row.state !== "disabled", "Liên kết không hợp lệ hoặc đã hết hạn", 400);
		ensure(row.purpose !== "setup" || !this.isSetup(), "Tài khoản Lead đã được thiết lập", 409);
		return row;
	}
	async consume(token, password) {
		validatePassword(password);
		const info = this.tokenInfo(token);
		const digest = await passwordHash(password);
		const hub = new Hub(this.store, "");
		this.store.transaction(() => {
			this.tokenInfo(token);
			ensure(this.store.sql.prepare("UPDATE auth_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?").run(Date.now(), hashToken(token), Date.now()).changes === 1, "Liên kết đã được sử dụng", 409);
			this.store.sql.prepare("INSERT INTO auth_credentials(member_id,password_hash,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash,version=version+1,updated_at=excluded.updated_at").run(info.member_id, digest, (/* @__PURE__ */ new Date()).toISOString());
			this.store.sql.prepare("UPDATE members SET auth_id=?,state='active',invite_expires=NULL WHERE id=?").run("local:" + info.member_id, info.member_id);
			this.store.sql.prepare("DELETE FROM auth_sessions WHERE member_id=?").run(info.member_id);
			this.store.sql.prepare("DELETE FROM auth_tokens WHERE member_id=?").run(info.member_id);
			this.store.sql.prepare("INSERT INTO audit(id,actor_id,action,entity_id,before,after,created_at) VALUES(?,?,?,?,NULL,NULL,?)").run(crypto.randomUUID(), info.member_id, info.purpose === "invite" ? "Kích hoạt tài khoản bằng lời mời" : "Thiết lập / khôi phục mật khẩu", info.member_id, hub.stamp());
		});
		return {
			memberId: info.member_id,
			token: this.session(info.member_id)
		};
	}
	async changePassword(me, current, next) {
		ensure(typeof current === "string" && current.length <= 128, "Mật khẩu hiện tại không hợp lệ");
		validatePassword(next);
		this.limit("change-password:" + me.id, 8);
		const credential = this.store.sql.prepare("SELECT password_hash FROM auth_credentials WHERE member_id=?").get(me.id);
		ensure(credential && await passwordMatches(current, credential.password_hash), "Mật khẩu hiện tại không đúng", 403);
		const token = this.issue(me.id, "reset", 1);
		return this.consume(token.token, next);
	}
	async afterMutation(action, result, actor, body, req, publicOrigin) {
		if (action !== "member" || !result.id) return result;
		const member = this.store.sql.prepare("SELECT * FROM members WHERE id=?").get(result.id);
		if (body.state === "disabled" || body.role) this.store.sql.prepare("DELETE FROM auth_sessions WHERE member_id=? AND member_id!=?").run(result.id, actor.id);
		if (body.state === "invited") {
			const invite = this.issue(result.id, "invite", 168);
			return {
				...result,
				invitationUrl: `${publicOrigin || new URL(req.url).origin}/auth/activate?token=${invite.token}`,
				username: member.email.split("@")[0],
				inviteExpires: invite.expires
			};
		}
		return result;
	}
};
//#endregion
//#region lib/qc-matrix-export.ts
function qcMatrixSheets(session, review, presence, warnings) {
	const checks = review ? qcLogRows(review.data).map((r) => ({
		...r.check,
		objectId: r.objectId,
		result: r.errors.length ? "changes" : r.check?.result || "passed",
		frameId: r.check?.frameId || "",
		type: r.check?.type || "",
		severity: r.check?.severity || "minor",
		description: r.check?.description || "",
		evidence: r.check?.evidence || ""
	})) : session.data.draft?.idChecks || [];
	const frames = presence?.frames || Array.from({ length: Math.min(2e3, session.data.frameCount || 60) }, (_, i) => i), tracks = new Map((presence?.tracks || []).map((t) => [qcIdKey(t.id), t]));
	if (!presence && session.data.frameCount > 2e3) throw new Error("Ma trận hỗ trợ tối đa 2.000 frame khi chưa có file đối chiếu; hãy chia nhỏ lượt QC.");
	if (frames.length * checks.length > 5e5) throw new Error("Ma trận vượt 500.000 ô; hãy xuất từng lượt QC nhỏ hơn.");
	const byId = /* @__PURE__ */ new Map();
	for (const w of warnings) {
		const id = qcIdKey(String(w.track ?? ""));
		if (!byId.has(id)) byId.set(id, []);
		byId.get(id).push(w);
	}
	const logs = review ? review.data.errors || [] : checks.flatMap((c) => rowFrameLogs(c).map((l) => ({
		...l,
		objectId: c.objectId
	})));
	const styles = [], rows = [];
	for (const c of checks) {
		const id = qcIdKey(c.objectId), track = tracks.get(id), present = new Set(track?.present || []), issues = byId.get(id) || [], own = logs.filter((l) => qcIdKey(l.objectId || "") === id), cells = /* @__PURE__ */ new Map();
		for (const w of issues) {
			if (!cells.has(w.frame)) cells.set(w.frame, []);
			cells.get(w.frame).push(BASIC_CHECKS.find((b) => b.key === w.check)?.code || w.code || "!");
		}
		const row = [
			c.objectId,
			track?.label || "",
			issues.length
		], color = [
			0,
			0,
			2
		];
		for (const f of frames) {
			const manual = own.filter((l) => inFrameRange(l, f)), value = matrixCodes([...cells.get(f) || [], ...manual.map((l) => l.code || "L")]), fixed = manual.length && manual.every((l) => l.fixed || l.verification === "passed");
			row.push(value);
			color.push(manual.length ? value.length > 1 ? fixed ? 15 : 13 : fixed ? 14 : 12 : value ? value.length > 1 ? 10 : 9 : presence ? present.has(f) ? 8 : 0 : 11);
		}
		rows.push(row);
		styles.push(color);
	}
	return [
		{
			name: "Matrix",
			rows: [[
				"Object ID",
				"Class",
				"Tổng issue Tool",
				...frames.map(String)
			], ...rows],
			widths: [
				14,
				20,
				18,
				...frames.map(() => 6)
			],
			freezeColumns: 3,
			matrixStyle: (r, c) => styles[r]?.[c]
		},
		{
			name: "Log QC",
			rows: [[
				"Object ID",
				"Từ frame",
				"Đến frame",
				"Mã",
				"Loại lỗi",
				"Mức độ",
				"Nội dung log",
				"Annotator sửa",
				"QC kiểm lại",
				"Ghi chú sửa"
			], ...logs.map((l) => [
				l.objectId,
				l.frameId === "" || l.frameId == null ? "" : Number(l.frameId),
				l.frameEnd ? Number(l.frameEnd) : l.frameId === "" || l.frameId == null ? "" : Number(l.frameId),
				l.code || "L",
				l.type,
				{
					minor: "Nhẹ",
					major: "Nặng",
					critical: "Nghiêm trọng"
				}[l.severity] || l.severity,
				l.description,
				review ? l.fixed ? "Đã sửa" : "Chưa sửa" : "Nháp",
				l.verification === "passed" ? "Sửa đúng" : l.verification === "failed" ? "Vẫn sai" : review ? "Chưa xác minh" : "Nháp",
				l.fixNote || ""
			])]
		},
		{
			name: "QC tung ID",
			rows: [[
				"Object ID",
				"Kết quả người QC",
				"Số log QC",
				"Ghi chú ID"
			], ...checks.map((c) => [
				c.objectId,
				c.result === "changes" ? "Có lỗi" : c.result === "passed" ? "Đạt" : "Chưa kiểm",
				logs.filter((l) => qcIdKey(l.objectId || "") === qcIdKey(c.objectId)).length,
				c.description || ""
			])]
		},
		{
			name: "Huong dan",
			rows: [
				["Nội dung", "Chi tiết"],
				["Job / ngày QC", `${session.data.jobId || "—"} / ${session.date || "—"}`],
				["Trạng thái", review ? "Kết quả QC đã hoàn tất" : "NHÁP đã lưu; chưa gửi cho annotator"],
				["Ghi chú QC", review?.data.note || session.data.draft?.note || ""],
				["Log phạm vi", "Một dòng Log QC là một log cho toàn bộ Từ frame–Đến frame; không nhân thành nhiều lỗi."],
				...BASIC_CHECKS.map((c) => [c.code, c.name]),
				["L", "Log lỗi khác do người QC ghi"],
				["Nền xanh nhạt", "Có box trong file; không có cảnh báo tool. Vẫn cần QC thủ công."],
				["Nền trắng", "Không có box trong dữ liệu file; không tự suy ra outside."],
				["Nền xám", "Chưa có file đối chiếu hiện diện."],
				["Nền vàng / cam", "Một / nhiều mã cảnh báo hoặc log QC."],
				["Viền đỏ / xanh dương", "Log chưa sửa / annotator đã xác nhận sửa hoặc QC xác minh sửa đúng."],
				["Tổng issue Tool", "Số cảnh báo tự động của ID. Số log QC xem từng dòng ở tab Log QC."],
				["KPI / rework", "Xuất file không thay đổi KPI. Cảnh báo tool không tự cộng rework."]
			]
		}
	];
}
//#endregion
//#region self-host/qc-basic.ts
var json$2 = (value, status = 200) => Response.json(value, {
	status,
	headers: {
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff"
	}
});
var bounded = async (req, limit) => {
	ensure(Number(req.headers.get("Content-Length") || 0) <= limit, "Tệp quá lớn", 413);
	const reader = req.body?.getReader();
	ensure(reader, "Thiếu tệp dữ liệu");
	let size = 0;
	const chunks = [];
	for (;;) {
		const r = await reader.read();
		if (r.done) break;
		size += r.value.length;
		if (size > limit) {
			await reader.cancel();
			ensure(false, "Tệp tối đa 25 MB", 413);
		}
		chunks.push(r.value);
	}
	return Buffer.concat(chunks);
};
var BasicQcService = class {
	constructor(makeHub, dataDir, qcRoot) {
		this.makeHub = makeHub;
		this.dataDir = dataDir;
		this.qcRoot = qcRoot;
		this.jobs = /* @__PURE__ */ new Map();
		this.matrices = /* @__PURE__ */ new Map();
	}
	python() {
		return process.env.HUB_QC_PYTHON || join(this.qcRoot, ".runtime/qc-python", process.platform === "win32" ? "python.exe" : "bin/python");
	}
	busy() {
		return [...this.jobs.values()].some((v) => !v.child || v.child.exitCode === null && v.child.signalCode === null);
	}
	async initialize() {
		const hub = this.makeHub();
		for (const row of await hub.rows("qc-basic")) if (row.status === "running") await hub.db.batch([hub.replace(row, {
			...row.data,
			error: "Máy chủ đã khởi động lại khi đang kiểm tra. Có thể tải lại file để chạy lại."
		}, "failed")]);
	}
	async assignment(m, id, write = false) {
		const hub = this.makeHub(), assignment = await hub.get(id, "qc-assignment"), task = await hub.get(assignment.task_id, "task");
		ensure(m.role === "Lead" || m.role === "QA/QC" && assignment.data.reviewerId === m.id || !write && assignment.data.assigneeId === m.id, "Không có quyền kiểm tra Job này", 403);
		if (write) ensure(task.data.assigneeId === assignment.data.assigneeId, "Lead cần cập nhật người làm trong phân công trước", 409);
		return {
			hub,
			assignment,
			task
		};
	}
	async presence(run, result) {
		if (result.matrix) return result.matrix;
		if (this.matrices.has(run.id)) return this.matrices.get(run.id);
		const promise = (async () => {
			const file = await this.makeHub().get(run.data.excelFileId, "file");
			ensure(/^files\/[a-f0-9-]{36}$/.test(file.data.key), "Không tìm thấy Excel ma trận", 409);
			const key = "matrix-" + run.id;
			try {
				return await new Promise((done, reject) => {
					const child = execFile(this.python(), [
						"-I",
						"-X",
						"utf8",
						join(this.qcRoot, "tool-qc/matrix_reader.py"),
						join(this.dataDir, file.data.key)
					], {
						windowsHide: true,
						timeout: 2e4,
						maxBuffer: 12 * 1024 * 1024,
						encoding: "utf8"
					}, (error, stdout, stderr) => {
						if (error) {
							reject(new Error((stderr || "Không đọc được Matrix trong Excel cũ.").slice(0, 1e3)));
							return;
						}
						try {
							done(JSON.parse(stdout));
						} catch {
							reject(/* @__PURE__ */ new Error("Ma trận cũ không hợp lệ."));
						}
					});
					this.jobs.set(key, { child });
				});
			} finally {
				this.jobs.delete(key);
			}
		})();
		this.matrices.set(run.id, promise);
		if (this.matrices.size > 3) this.matrices.delete(this.matrices.keys().next().value);
		promise.catch(() => this.matrices.delete(run.id));
		return promise;
	}
	async handle(req, m) {
		const url = new URL(req.url), action = url.pathname.split("/qc-basic/")[1];
		if (action === "matrix-export" && req.method === "GET") {
			const hub = this.makeHub(), session = await hub.get(url.searchParams.get("sessionId") || "", "qc-session");
			ensure(m.role === "Lead" || m.role === "QA/QC" && session.data.reviewerId === m.id || session.status === "completed" && session.data.assigneeId === m.id, "Chỉ người QC được giao hoặc Lead được xuất nháp; annotator xem kết quả đã hoàn tất của mình", 403);
			ensure(["in_progress", "completed"].includes(session.status), "Chưa bắt đầu lượt QC này", 409);
			const review = session.data.reviewId ? await hub.get(session.data.reviewId, "review") : void 0;
			const assignment = (await hub.rows("qc-assignment")).find((r) => r.task_id === session.task_id && r.data.assigneeId === session.data.assigneeId), runId = review?.data.matrixRunId || session.data.matrixRunId || assignment?.data.basicCompletedRunId;
			let presence = null, warnings = [];
			if (runId) {
				const run = await hub.get(runId, "qc-basic");
				ensure(run.task_id === session.task_id && run.owner_id === session.data.assigneeId, "File không thuộc lượt QC này", 403);
				ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey || ""), "Kết quả chưa sẵn sàng", 409);
				const result = JSON.parse(await readFile(join(this.dataDir, run.data.resultKey), "utf8"));
				presence = await this.presence(run, result);
				warnings = result.rows;
			}
			let sheets;
			try {
				sheets = qcMatrixSheets(!review && !session.data.draft ? {
					...session,
					data: {
						...session.data,
						draft: { idChecks: qcIdRows(session.data.rangeStart, session.data.endId, "Khác") }
					}
				} : session, review, presence, warnings);
			} catch (e) {
				ensure(false, e instanceof Error ? e.message : "Không xuất được ma trận");
			}
			const bytes = xlsx(sheets);
			return new Response(bytes, { headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="QC_Matrix_${String(session.data.jobId || "Job").replace(/[^a-zA-Z0-9_-]/g, "_")}_${session.date}${review ? "" : "_draft"}.xlsx"`,
				"Cache-Control": "private, no-store",
				"X-Content-Type-Options": "nosniff"
			} });
		}
		if (action === "environment" && req.method === "GET") return json$2({ ready: existsSync(this.python()) && existsSync(join(this.qcRoot, "tool-qc/web_runner.py")) });
		if (["result", "matrix"].includes(action) && req.method === "GET") {
			const run = await this.makeHub().get(url.searchParams.get("id") || "", "qc-basic");
			await this.assignment(m, run.data.assignmentId);
			ensure(run.data.resultKey, "Kết quả chưa sẵn sàng", 409);
			ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey), "Mã tệp kết quả không hợp lệ");
			const result = JSON.parse(await readFile(join(this.dataDir, run.data.resultKey), "utf8"));
			if (action === "matrix") {
				const presence = await this.presence(run, result);
				try {
					return json$2(matrixPage(presence, result.rows, url.searchParams));
				} catch (e) {
					ensure(false, e instanceof Error ? e.message : "Bộ lọc ma trận không hợp lệ");
				}
			}
			const check = url.searchParams.get("check") || "", track = (url.searchParams.get("track") || "").trim(), frame = (url.searchParams.get("frame") || "").trim();
			const from = url.searchParams.get("fromFrame"), to = url.searchParams.get("toFrame"), primary = url.searchParams.get("primary") === "1";
			ensure((!from || /^\d{1,9}$/.test(from)) && (!to || /^\d{1,9}$/.test(to)) && (!from || !to || Number(from) <= Number(to)), "Phạm vi frame không hợp lệ");
			const filtered = result.rows.filter((r) => (!check || r.check === check) && (!track || String(r.track) === track || !primary && String(r.other) === track) && (!frame || String(r.frame) === frame) && (!from || r.frame >= Number(from)) && (!to || r.frame <= Number(to)));
			const requested = Number(url.searchParams.get("page") || 1), page = Math.min(Math.max(1, Number.isSafeInteger(requested) ? requested : 1), Math.max(1, Math.ceil(filtered.length / 25)));
			return json$2({
				summary: result.summary,
				config: result.config,
				rows: filtered.slice((page - 1) * 25, page * 25),
				total: filtered.length,
				page,
				pages: Math.max(1, Math.ceil(filtered.length / 25))
			});
		}
		if (action === "complete" && req.method === "POST") {
			const body = JSON.parse((await bounded(req, 16384)).toString("utf8")), hub = this.makeHub(), run = await hub.get(String(body.id || ""), "qc-basic"), { assignment } = await this.assignment(m, run.data.assignmentId, true);
			ensure(run.status === "ready" && assignment.data.basicRunId === run.id, "Chọn kết quả mới nhất đã chạy xong", 409);
			ensure(body.reviewed === true, "Cần xác nhận đã xem kết quả trước khi QC chi tiết");
			ensure(typeof (body.note || "") === "string" && (body.note || "").length <= 1e4, "Nhận xét tối đa 10.000 ký tự");
			await hub.commit(m, "Hoàn tất bước Tool_QC cơ bản", run, "qc-basic", {
				...run.data,
				reviewedBy: m.id,
				reviewedAt: hub.stamp(),
				note: body.note || ""
			}, { status: "completed" }, [hub.replace(assignment, {
				...assignment.data,
				basicCompletedRunId: run.id
			})]);
			return json$2({ ok: true });
		}
		if (action === "run" && req.method === "POST") {
			ensure(!this.busy(), "Tool_QC đang xử lý một file khác. Chờ hoàn tất rồi thử lại.", 409);
			const bytes = await bounded(req, 26 * 1024 * 1024), form = await new Response(bytes, { headers: { "Content-Type": req.headers.get("Content-Type") || "" } }).formData(), { hub, assignment, task } = await this.assignment(m, String(form.get("assignmentId") || ""), true);
			const file = form.get("file"), offset = Number(form.get("trackOffset") ?? 1), reason = String(form.get("reason") || "").trim();
			ensure(file && typeof file.arrayBuffer === "function" && file.size > 0 && file.size <= 25 * 1024 * 1024 && /\.(json|zip)$/i.test(file.name), "Chọn file Datumaro .json hoặc .zip, tối đa 25 MB");
			ensure([0, 1].includes(offset), "Offset Track ID chỉ nhận 0 hoặc 1");
			const state = basicQcState(await hub.rows(), assignment);
			ensure(!state.latest || state.latest.status !== "running", "Job đang chạy Tool_QC", 409);
			if (state.runs.some((r) => ["ready", "completed"].includes(r.status))) {
				hub.lead(m);
				ensure(reason.length >= 3 && reason.length <= 1e3, "Lead cần ghi lý do chạy lại (3–1.000 ký tự)");
			}
			ensure(existsSync(this.python()), "Máy host chưa cài bộ chạy Tool_QC. Lead xem hướng dẫn cài Python/openpyxl.", 503);
			const id = randomUUID(), input = Buffer.from(await file.arrayBuffer()), name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180), data = {
				assignmentId: assignment.id,
				assigneeId: assignment.data.assigneeId,
				reviewerId: assignment.data.reviewerId,
				taskCode: task.data.code || "",
				jobId: task.data.jobId || "",
				fileName: name,
				fileHash: createHash("sha256").update(input).digest("hex"),
				trackOffset: offset,
				requestedBy: m.id,
				startedAt: hub.stamp(),
				reason
			};
			ensure(!this.busy(), "Tool_QC đang bận", 409);
			this.jobs.set(id, {});
			try {
				await hub.db.batch([
					hub.insert("qc-basic", id, data, {
						owner_id: assignment.data.assigneeId,
						task_id: task.id,
						project_id: task.project_id,
						date: today(hub.now),
						status: "running"
					}),
					hub.replace(assignment, {
						...assignment.data,
						basicRunId: id
					}),
					hub.audit(m.id, "Chạy Tool_QC cơ bản lần đầu", id, null, {
						assignmentId: assignment.id,
						fileHash: data.fileHash,
						fileName: name,
						reason
					})
				]);
			} catch (e) {
				this.jobs.delete(id);
				throw e;
			}
			const promise = this.execute(id, input, m, task);
			this.jobs.get(id).promise = promise;
			promise.finally(() => this.jobs.delete(id));
			return json$2({
				ok: true,
				id
			}, 202);
		}
		return json$2({ error: "Không tìm thấy" }, 404);
	}
	async execute(id, input, actor, task) {
		const workRoot = resolve(this.dataDir, "qc-work");
		let dir = "";
		try {
			await mkdir(workRoot, {
				recursive: true,
				mode: 448
			});
			dir = await mkdtemp(join(workRoot, "run-"));
			await writeFile(join(dir, "input"), input, { mode: 384 });
			const run = await this.makeHub().get(id, "qc-basic");
			await new Promise((done, reject) => {
				const child = spawn(this.python(), [
					"-I",
					"-X",
					"utf8",
					join(this.qcRoot, "tool-qc/web_runner.py"),
					join(dir, "input"),
					join(dir, "result.json"),
					join(dir, "report.xlsx"),
					String(run.data.trackOffset)
				], {
					windowsHide: true,
					shell: false,
					stdio: [
						"ignore",
						"pipe",
						"pipe"
					]
				});
				this.jobs.get(id).child = child;
				let error = "";
				child.stderr?.on("data", (v) => {
					if (error.length < 4e3) error += v.toString();
				});
				child.stdout?.resume();
				const timeout = setTimeout(() => {
					child.kill();
					reject(/* @__PURE__ */ new Error("Kiểm tra vượt 120 giây. Hãy chia nhỏ dữ liệu rồi thử lại."));
				}, 12e4);
				child.once("error", reject);
				child.once("close", (code) => {
					clearTimeout(timeout);
					code === 0 ? done() : reject(new Error(error.trim() || "Tool_QC không xử lý được file. Kiểm tra định dạng Datumaro."));
				});
			});
			const hub = this.makeHub(), result = await readFile(join(dir, "result.json")), excel = await readFile(join(dir, "report.xlsx")), parsed = JSON.parse(result.toString("utf8")), current = await hub.get(id, "qc-basic"), statements = [], keys = [];
			await mkdir(join(this.dataDir, "files"), {
				recursive: true,
				mode: 448
			});
			for (const [bytes, name] of [
				[input, current.data.fileName],
				[result, "tool-qc-result.json"],
				[excel, `Tool_QC_Job_${current.data.jobId || task.id}.xlsx`]
			]) {
				const fileId = randomUUID(), key = "files/" + fileId;
				await writeFile(join(this.dataDir, key), bytes, {
					flag: "wx",
					mode: 384
				});
				keys.push({
					id: fileId,
					key
				});
				statements.push(hub.insert("file", fileId, {
					name,
					size: bytes.length,
					key,
					entityId: task.id,
					basicRunId: id
				}, {
					owner_id: current.owner_id,
					task_id: task.id,
					project_id: task.project_id
				}));
			}
			await hub.commit(actor, "Tool_QC đã xử lý xong", current, "qc-basic", {
				...current.data,
				completedAt: hub.stamp(),
				summary: parsed.summary,
				inputFileId: keys[0].id,
				resultFileId: keys[1].id,
				resultKey: keys[1].key,
				excelFileId: keys[2].id
			}, { status: "ready" }, statements);
		} catch (e) {
			try {
				const hub = this.makeHub(), run = await hub.get(id, "qc-basic");
				await hub.commit(actor, "Tool_QC không hoàn tất", run, "qc-basic", {
					...run.data,
					error: (e instanceof Error ? e.message : "Không xử lý được file").slice(0, 2e3)
				}, { status: "failed" });
			} catch (error) {
				console.error("Cannot save Tool_QC failure", error instanceof Error ? error.message : "unknown");
			}
		} finally {
			if (dir && dir.startsWith(workRoot + sep)) await rm(dir, {
				recursive: true,
				force: true
			}).catch(() => {});
		}
	}
	async close() {
		for (const value of this.jobs.values()) value.child?.kill();
		await Promise.allSettled([...this.jobs.values()].map((v) => v.promise));
	}
};
//#endregion
//#region lib/task-kpi-guide.ts
function taskDailyGuide(records, owner, taskId, day, production) {
	const report = records.find((r) => r.kind === "daily" && r.owner_id === owner && r.date === day && [
		"submitted",
		"approved",
		"imported"
	].includes(r.status)), cuboidProjects = new Set(records.filter((r) => r.kind === "project" && r.data.unit === "cuboid").map((r) => r.id)), cuboidTasks = new Set(records.filter((r) => r.kind === "task" && cuboidProjects.has(r.project_id || "")).map((r) => r.id));
	const otherQuantity = (report?.data.lines || []).filter((l) => l.taskId !== taskId && l.activity !== "qc" && !l.productionPending && cuboidTasks.has(l.taskId)).reduce((n, l) => n + (Number(l.quantity) || 0), 0), line = (report?.data.lines || []).find((l) => l.taskId === taskId && l.activity !== "qc");
	const source = records.find((r) => r.kind === "kpi-source" && r.task_id === taskId && r.owner_id === owner && r.status === "active");
	return {
		...suggestDailyEnd(records, owner, taskId, day, production || source?.data.production, otherQuantity, report?.id),
		otherQuantity,
		reportedQuantity: line && !line.productionPending ? Number(line.quantity) || 0 : 0,
		reportedEnd: line ? reportEndId(line) : "",
		reportSent: !!report
	};
}
//#endregion
//#region self-host/kpi-count.ts
var json$1 = (value, status = 200) => Response.json(value, {
	status,
	headers: {
		"Cache-Control": "private, no-store",
		"X-Content-Type-Options": "nosniff"
	}
});
async function bytes(req, limit) {
	ensure(Number(req.headers.get("Content-Length") || 0) <= limit, "Tệp quá lớn", 413);
	const reader = req.body?.getReader();
	ensure(reader, "Thiếu dữ liệu");
	const chunks = [];
	let size = 0;
	for (;;) {
		const r = await reader.read();
		if (r.done) break;
		size += r.value.length;
		if (size > limit) {
			await reader.cancel();
			ensure(false, "Tệp tối đa 25 MB", 413);
		}
		chunks.push(r.value);
	}
	return Buffer.concat(chunks);
}
var KpiCountService = class {
	busy() {
		return [...this.jobs.values()].some((job) => !job.child || job.child.exitCode === null && job.child.signalCode === null);
	}
	constructor(makeHub, dataDir, root) {
		this.makeHub = makeHub;
		this.dataDir = dataDir;
		this.root = root;
		this.jobs = /* @__PURE__ */ new Map();
	}
	python() {
		return process.env.HUB_QC_PYTHON || join(this.root, ".runtime/qc-python", process.platform === "win32" ? "python.exe" : "bin/python");
	}
	async initialize() {
		const hub = this.makeHub();
		for (const run of await hub.rows("kpi-count")) if (run.status === "running") await hub.db.batch([hub.replace(run, {
			...run.data,
			error: "Máy chủ khởi động lại; tải lại file để đếm tiếp."
		}, "failed")]);
	}
	async task(m, id) {
		const hub = this.makeHub(), task = await hub.get(id, "task");
		ensure(task.data.assigneeId === m.id || m.role === "Lead" || m.role === "QA/QC" && (task.data.reviewerId === m.id || (await hub.rows("qc-assignment")).some((r) => r.task_id === id && r.data.reviewerId === m.id)), "Không có quyền xem hoặc đếm Job này", 403);
		return {
			hub,
			task
		};
	}
	async result(run) {
		ensure(/^files\/[a-f0-9-]{36}$/.test(run.data.resultKey || ""), "Kết quả chưa sẵn sàng", 409);
		return JSON.parse(await readFile(join(this.dataDir, run.data.resultKey), "utf8"));
	}
	async handle(req, m) {
		const url = new URL(req.url), action = url.pathname.split("/kpi-count/")[1];
		if (["result", "export"].includes(action) && req.method === "GET") {
			const hub = this.makeHub(), run = await hub.get(url.searchParams.get("id") || "");
			ensure(["kpi-count", "qc-basic"].includes(run.kind), "Sai loại kết quả");
			const preview = !!run.data.assignmentPreview && !run.task_id;
			let task;
			if (preview) {
				hub.lead(m);
				task = {
					...run,
					id: run.data.editTaskId || "preview-" + run.id,
					data: {
						code: run.data.taskCode,
						jobId: run.data.jobId,
						assigneeId: run.owner_id
					}
				};
				if (!["ready", "completed"].includes(run.status)) {
					ensure(action !== "export", "File chưa sẵn sàng", 409);
					return json$1({
						status: run.status,
						error: run.data.error || ""
					});
				}
			} else {
				task = (await this.task(m, run.task_id)).task;
				ensure(run.owner_id === task.data.assigneeId, "Kết quả thuộc người làm trước của Job", 409);
			}
			const production = (await this.result(run)).production;
			ensure(production, "Kết quả cũ chưa có thống kê keyframe; tải file vào bộ đếm mới", 409);
			const records = await hub.rows(), source = preview ? void 0 : records.find((r) => r.kind === "kpi-source" && r.task_id === task.id && r.owner_id === run.owner_id && r.status === "active");
			let ledger, ledgerError = "";
			if (production.format === "datumaro") try {
				ensure(!source || source.data.production.basis === "datumaro-baseline-v1", "Job đang dùng cách đếm khác; không tự thay mốc tính KPI", 409);
				ledger = datumaroLedger(production, {
					runId: run.id,
					fileHash: run.data.fileHash,
					fileName: run.data.fileName
				}, source?.data.production, completedThrough(records, run.owner_id, task.id));
			} catch (e) {
				ledgerError = e instanceof Error ? e.message : "Không đối chiếu được file";
			}
			const counted = ledger || production, comparisons = keyframeComparisons(records, run.owner_id, task.id, counted);
			if (action === "export") return new Response(xlsx([
				ledger ? {
					name: "Cuboid theo ID",
					rows: [[
						"Object ID",
						"Class / Label",
						"Mốc ban đầu",
						"ID mới được tính",
						"Cuboid tính KPI",
						"Cuboid trong file hiện tại"
					], ...ledger.ids.map((r) => [
						r.id,
						r.label,
						r.baselineCount,
						r.addedCount,
						r.credit,
						r.currentCount
					])]
				} : {
					name: "Cuboid theo ID",
					rows: [[
						"Object ID",
						"Class / Label",
						"Keyframe hiện",
						"Keyframe outside",
						"Tổng cuboid keyframe",
						"Nội suy không tính",
						"Thiếu cờ",
						"Frame đầu",
						"Frame cuối"
					], ...production.ids.map((r) => [
						r.id,
						r.label,
						r.visible,
						r.outside,
						r.keyframes,
						r.interpolated,
						r.unknown,
						r.firstFrame,
						r.lastFrame
					])]
				},
				{
					name: "Doi chieu Daily Report",
					rows: [[
						"Ngày",
						"Job ID",
						"Mốc trước",
						"ID làm tới",
						"Từ ID",
						"Đến ID",
						"Số ID có trong file",
						"Cuboid đã lưu",
						"Keyframe theo file",
						"Trong đó outside",
						"Chênh lệch",
						"Kết quả",
						"File lúc lưu KPI"
					], ...comparisons.map((r) => [
						r.date,
						task.data.jobId,
						r.previousEnd,
						r.endId,
						r.start,
						r.end,
						r.countedIds,
						r.savedQuantity,
						r.quantity,
						r.outside,
						r.difference,
						r.error || (!r.difference ? "Khớp" : "Cần đối chiếu"),
						r.snapshot?.fileHash || ""
					])]
				},
				{
					name: "Luu y",
					rows: [
						["Nội dung", "Chi tiết"],
						["File", run.data.fileName],
						["SHA-256", run.data.fileHash],
						["Định dạng", production.format],
						["Object ID", production.mapping],
						["KPI cũ", "Chỉ đối chiếu, không tự sửa sản lượng đã lưu"],
						["Cách tính", ledger ? "Giữ số cuboid/ID ở file ban đầu + số cuboid của ID mới. File sau giảm do outside không trừ mốc ban đầu. ID mới lấy số lớn nhất đã thấy trước khi báo hoàn thành; không cộng trùng qua các file." : "1 cặp Object ID/frame keyframe = 1 cuboid; gồm outside, bỏ nội suy, không nhân hệ số"],
						["Định danh", "Cần cùng Job, cùng phạm vi frame và Object ID ổn định. Không tự nhận diện việc đánh lại số ID."],
						["Prelabel", "Đếm khối lượng ID khai hoàn thành, không chứng minh ai chỉnh box"],
						["Đối chiếu", ledgerError || "Đã đọc file"],
						...production.issues.map((s) => ["Cần kiểm tra", s])
					]
				}
			]), { headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				"Content-Disposition": `attachment; filename="Keyframe_KPI_Job_${String(task.data.jobId || "job").replace(/\D/g, "")}.xlsx"`,
				"Cache-Control": "private, no-store"
			} });
			const track = (url.searchParams.get("track") || "").trim(), ids = counted.ids.filter((r) => !track || String(r.id) === track), pages = Math.max(1, Math.ceil(ids.length / 25)), requested = Number(url.searchParams.get("page") || 1), page = Math.min(pages, Math.max(1, Number.isSafeInteger(requested) ? requested : 1));
			const { ids: _, ...summary } = production;
			const accounting = ledger ? {
				...(({ ids: _, ...rest }) => rest)(ledger),
				idCount: ledger.ids.length
			} : null;
			let guide = null;
			if (preview && ledger) {
				const owner = url.searchParams.get("memberId"), day = url.searchParams.get("day") || today(hub.now);
				ensure(/^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day, "Ngày gợi ý không hợp lệ");
				if (owner) {
					ensure((await hub.members()).some((v) => v.id === owner && v.state !== "disabled"), "Thành viên không hợp lệ");
					guide = taskDailyGuide(records, owner, task.id, day, ledger);
				}
			}
			return json$1({
				status: run.status,
				guide,
				production: {
					...summary,
					idCount: production.ids.length
				},
				accounting,
				ledgerError,
				sourceRevision: source?.revision || 0,
				ids: ids.slice((page - 1) * 25, page * 25),
				total: ids.length,
				page,
				pages,
				comparisons
			});
		}
		if (action === "assign" && req.method === "POST") {
			const hub = this.makeHub();
			hub.lead(m);
			const body = JSON.parse((await bytes(req, 65536)).toString("utf8")), run = await hub.get(String(body.runId || ""), "kpi-count"), input = body.task;
			ensure(run.data.assignmentPreview && !run.task_id && run.owner_id === m.id, "Chọn file xem trước do Lead tải khi giao task", 403);
			ensure(body.matched === true, "Cần xác nhận file ban đầu đúng Job và Object ID trước khi giao");
			ensure(input && typeof input === "object", "Thiếu thông tin phân công");
			const assignmentHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
			if (run.data.assignedTaskId) {
				ensure(run.data.assignmentHash === assignmentHash, "File này đã gắn vào task. Mở task đã lưu để cập nhật.", 409);
				await hub.get(run.data.assignedTaskId, "task");
				return json$1({
					ok: true,
					id: run.data.assignedTaskId,
					reused: true
				});
			}
			ensure(run.status === "ready", "Chờ đếm file xong trước khi giao task", 409);
			ensure(input.projectId === run.project_id && String(input.code || "").trim() === run.data.taskCode && String(input.jobId || "").trim() === run.data.jobId && (input.id || "") === (run.data.editTaskId || ""), "Thông tin Task/Job đã đổi sau khi tải file. Đếm lại file đúng bài trước khi lưu.", 409);
			try {
				const { production: raw } = await this.result(run), assignedRunId = randomUUID();
				let production;
				try {
					production = datumaroLedger(raw, {
						runId: assignedRunId,
						fileHash: run.data.fileHash,
						fileName: run.data.fileName
					});
				} catch (e) {
					ensure(false, e instanceof Error ? e.message : "File Datumaro không hợp lệ", 409);
				}
				ensure(production.creditTotal > 0, "File chưa có cuboid để giao");
				const plan = await hub.planTask(m, {
					...input,
					quantity: production.creditTotal,
					frameCount: production.scopeFrames.length || production.frames
				});
				ensure(!(await hub.rows("kpi-source")).some((r) => r.task_id === plan.id && r.owner_id === plan.data.assigneeId && r.status === "active"), "Job đã có file ban đầu. Dùng cập nhật ID mới để giữ mốc cũ.", 409);
				const statements = [...plan.statements], fileIds = [];
				for (const sourceId of [
					run.data.inputFileId,
					run.data.resultFileId,
					run.data.excelFileId
				]) {
					const file = await hub.get(sourceId, "file"), fileId = randomUUID();
					fileIds.push(fileId);
					statements.push(hub.insert("file", fileId, {
						...file.data,
						entityId: plan.id,
						countRunId: assignedRunId
					}, {
						owner_id: plan.data.assigneeId,
						task_id: plan.id,
						project_id: plan.projectId
					}));
				}
				const assignedData = {
					...run.data,
					assignmentPreview: false,
					editTaskId: void 0,
					taskCode: plan.data.code,
					jobId: plan.data.jobId,
					inputFileId: fileIds[0],
					resultFileId: fileIds[1],
					excelFileId: fileIds[2],
					appliedSourceRevision: 1,
					appliedAt: hub.stamp()
				};
				statements.push(hub.insert("kpi-count", assignedRunId, assignedData, {
					owner_id: plan.data.assigneeId,
					task_id: plan.id,
					project_id: plan.projectId,
					date: run.date,
					status: "ready"
				}), hub.insert("kpi-source", randomUUID(), {
					runId: assignedRunId,
					fileHash: run.data.fileHash,
					fileName: run.data.fileName,
					capturedDate: run.date,
					confirmedBy: m.id,
					confirmedAt: hub.stamp(),
					production
				}, {
					owner_id: plan.data.assigneeId,
					task_id: plan.id,
					project_id: plan.projectId,
					natural_key: plan.id + ":" + plan.data.assigneeId,
					status: "active"
				}), hub.replace(run, {
					...run.data,
					assignedTaskId: plan.id,
					assignmentHash,
					assignedRunId
				}, "completed"), hub.audit(m.id, "Gắn file Datumaro ban đầu khi giao task", plan.id, null, {
					runId: assignedRunId,
					fileHash: run.data.fileHash,
					idCount: production.ids.length,
					cuboids: production.creditTotal
				}));
				await hub.db.batch(statements);
				return json$1({
					ok: true,
					id: plan.id
				});
			} catch (error) {
				const current = await hub.get(run.id, "kpi-count");
				if (current.data.assignedTaskId) {
					ensure(current.data.assignmentHash === assignmentHash, "File đã được dùng trong một phân công khác. Làm mới trước khi lưu.", 409);
					return json$1({
						ok: true,
						id: current.data.assignedTaskId,
						reused: true
					});
				}
				if (/constraint|UNIQUE|NOT NULL/i.test(error instanceof Error ? error.message : "")) ensure(false, "Phân công đã thay đổi. Làm mới và kiểm tra task đã lưu trước khi thử lại.", 409);
				throw error;
			}
		}
		if (action === "confirm" && req.method === "POST") {
			const body = JSON.parse((await bytes(req, 16384)).toString("utf8")), hub = this.makeHub(), run = await hub.get(String(body.id || ""));
			ensure(["kpi-count", "qc-basic"].includes(run.kind) && ["ready", "completed"].includes(run.status), "Kết quả chưa sẵn sàng", 409);
			const { task } = await this.task(m, run.task_id);
			ensure(run.owner_id === task.data.assigneeId, "Người làm Job đã thay đổi", 409);
			ensure(body.matched === true, "Cần đối chiếu Job và Object ID trong file với CVAT trước khi dùng tính KPI");
			const { production: raw } = await this.result(run);
			const old = (await hub.rows("kpi-source")).filter((r) => r.task_id === task.id && r.owner_id === run.owner_id)[0];
			ensure(!run.data.appliedSourceRevision || old?.data.runId === run.id, "File này đã được dùng trước đây. Chọn bảng đang dùng hoặc tải file cập nhật mới.", 409);
			const latest = (await hub.rows("kpi-count")).filter((r) => r.task_id === task.id && r.owner_id === run.owner_id && ["ready", "completed"].includes(r.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
			ensure(!latest || latest.id === run.id || run.created_at >= latest.created_at, "Đã có file đếm mới hơn; chọn kết quả mới nhất", 409);
			let production = raw;
			if (raw?.format === "datumaro") {
				ensure(body.sourceRevision === (old?.revision || 0), "Mốc đếm đã đổi. Làm mới bảng đối chiếu trước khi xác nhận.", 409);
				if (!old) ensure(m.role === "Lead", "Chỉ Lead được xác nhận file ban đầu của Job", 403);
				ensure(!old || old.data.production.basis === "datumaro-baseline-v1", "Job đang dùng cách đếm khác; không tự thay mốc tính KPI", 409);
				try {
					production = datumaroLedger(raw, {
						runId: run.id,
						fileHash: run.data.fileHash,
						fileName: run.data.fileName
					}, old?.data.production, completedThrough(await hub.rows(), run.owner_id, task.id));
				} catch (e) {
					ensure(false, e instanceof Error ? e.message : "Không đối chiếu được file", 409);
				}
			} else {
				ensure(raw?.usable && raw.completeOutside, "File chưa đủ dữ liệu outside/keyframe; chỉ dùng đối chiếu, không chốt KPI", 409);
				ensure(!old || old.data.production.basis !== "datumaro-baseline-v1", "Giữ file ban đầu Datumaro; không tự đổi cách tính KPI", 409);
			}
			if (old?.data.runId === run.id) return json$1({
				ok: true,
				reused: true
			});
			const data = {
				runId: run.id,
				fileHash: run.data.fileHash,
				fileName: run.data.fileName,
				capturedDate: run.date,
				confirmedBy: m.id,
				confirmedAt: hub.stamp(),
				production
			};
			await hub.commit(m, "Xác nhận bảng cuboid theo ID của Job", old || null, "kpi-source", data, {
				owner_id: run.owner_id,
				task_id: task.id,
				project_id: task.project_id,
				natural_key: task.id + ":" + run.owner_id,
				status: "active"
			}, [hub.replace(run, {
				...run.data,
				appliedSourceRevision: (old?.revision || 0) + 1,
				appliedAt: hub.stamp()
			})]);
			return json$1({ ok: true });
		}
		if (["run", "preview"].includes(action) && req.method === "POST") {
			ensure(!this.busy(), "Bộ đếm đang xử lý file khác. Chờ hoàn tất rồi thử lại.", 409);
			const form = await new Response(await bytes(req, 26 * 1024 * 1024), { headers: { "Content-Type": req.headers.get("Content-Type") || "" } }).formData(), hub = this.makeHub(), preview = action === "preview";
			let task = null;
			if (preview) hub.lead(m);
			else task = (await this.task(m, String(form.get("taskId") || ""))).task;
			const projectId = task?.project_id || String(form.get("projectId") || ""), project = await hub.get(projectId, "project");
			ensure(project.data.unit === "cuboid" && project.status === "active", "Bộ đếm chỉ áp dụng cho dự án cuboid đang hoạt động");
			const taskCode = task?.data.code || String(form.get("code") || "").trim(), jobId = task?.data.jobId || String(form.get("jobId") || "").trim(), editTaskId = preview ? String(form.get("editTaskId") || "") : "";
			if (preview) {
				ensure(taskCode.length <= 500 && /^\d{0,30}$/.test(jobId) && (taskCode || jobId), "Nhập Task ID / mã batch hoặc Job ID trước khi tải file");
				if (editTaskId) {
					const old = await hub.get(editTaskId, "task");
					ensure(old.project_id === projectId && old.data.code === taskCode && (old.data.jobId || "") === jobId, "Task/Job không khớp bài đang sửa", 409);
				}
			}
			const file = form.get("file"), offset = Number(form.get("trackOffset") ?? 1), index = String(form.get("jobIndex") || "").trim();
			ensure(file && typeof file.arrayBuffer === "function" && file.size > 0 && file.size <= 25 * 1024 * 1024 && /\.(json|zip)$/i.test(file.name), "Chọn JSON/ZIP annotation tối đa 25 MB");
			ensure([0, 1].includes(offset), "Offset chỉ nhận 0 hoặc 1");
			ensure(!index || /^\d{1,4}$/.test(index) && Number(index) > 0, "Thứ tự Job phải từ 1 đến 9.999");
			ensure(existsSync(this.python()), "Máy host chưa có Python/openpyxl cho Tool_QC", 503);
			const input = Buffer.from(await file.arrayBuffer()), id = randomUUID(), data = {
				taskCode,
				jobId,
				requestedBy: m.id,
				...preview ? {
					assignmentPreview: true,
					editTaskId
				} : {},
				fileName: file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180),
				fileHash: createHash("sha256").update(input).digest("hex"),
				trackOffset: offset,
				jobIndex: index,
				startedAt: hub.stamp()
			};
			ensure(!this.busy(), "Bộ đếm đang bận", 409);
			this.jobs.set(id, {});
			try {
				await hub.db.batch([hub.insert("kpi-count", id, data, {
					owner_id: task?.data.assigneeId || m.id,
					task_id: task?.id || null,
					project_id: projectId,
					date: today(hub.now),
					status: "running"
				}), hub.audit(m.id, preview ? "Xem file Datumaro trước khi giao task" : "Đếm cuboid keyframe từ file", id, null, {
					taskId: task?.id || null,
					fileHash: data.fileHash
				})]);
			} catch (e) {
				this.jobs.delete(id);
				throw e;
			}
			const promise = this.execute(id, input, m, task);
			this.jobs.get(id).promise = promise;
			promise.finally(() => this.jobs.delete(id));
			return json$1({
				ok: true,
				id
			}, 202);
		}
		return json$1({ error: "Không tìm thấy" }, 404);
	}
	async execute(id, input, actor, task) {
		const workRoot = resolve(this.dataDir, "kpi-work");
		let dir = "";
		try {
			await mkdir(workRoot, {
				recursive: true,
				mode: 448
			});
			dir = await mkdtemp(join(workRoot, "count-"));
			await writeFile(join(dir, "input"), input, { mode: 384 });
			const run = await this.makeHub().get(id);
			await new Promise((done, reject) => {
				const child = spawn(this.python(), [
					"-I",
					"-X",
					"utf8",
					join(this.root, "tool-qc/count_runner.py"),
					join(dir, "input"),
					join(dir, "result.json"),
					join(dir, "counts.xlsx"),
					String(run.data.trackOffset),
					run.data.jobIndex
				], {
					windowsHide: true,
					shell: false,
					stdio: [
						"ignore",
						"pipe",
						"pipe"
					]
				});
				this.jobs.get(id).child = child;
				let error = "";
				child.stdout?.resume();
				child.stderr?.on("data", (b) => {
					if (error.length < 4e3) error += b.toString();
				});
				const timer = setTimeout(() => {
					child.kill();
					reject(/* @__PURE__ */ new Error("Đếm vượt 120 giây; chia nhỏ file theo Job."));
				}, 12e4);
				child.once("error", reject);
				child.once("close", (code) => {
					clearTimeout(timer);
					code === 0 ? done() : reject(new Error(error.trim() || "Không đọc được annotation."));
				});
			});
			const hub = this.makeHub(), current = await hub.get(id), result = await readFile(join(dir, "result.json")), excel = await readFile(join(dir, "counts.xlsx")), parsed = JSON.parse(result.toString("utf8")), statements = [], files = [];
			await mkdir(join(this.dataDir, "files"), {
				recursive: true,
				mode: 448
			});
			for (const [data, name] of [
				[input, current.data.fileName],
				[result, "keyframe-count-result.json"],
				[excel, `Cuboid_Keyframe_Job_${current.data.jobId || task?.id || "preview"}.xlsx`]
			]) {
				const fileId = randomUUID(), key = "files/" + fileId;
				await writeFile(join(this.dataDir, key), data, {
					flag: "wx",
					mode: 384
				});
				files.push({
					id: fileId,
					key
				});
				statements.push(hub.insert("file", fileId, {
					name,
					size: data.length,
					key,
					entityId: task?.id || current.id,
					countRunId: id
				}, {
					owner_id: current.owner_id,
					task_id: task?.id || null,
					project_id: current.project_id
				}));
			}
			const { ids: _, ...summary } = parsed.production;
			await hub.commit(actor, "Đếm keyframe hoàn tất", current, "kpi-count", {
				...current.data,
				summary,
				inputFileId: files[0].id,
				resultFileId: files[1].id,
				resultKey: files[1].key,
				excelFileId: files[2].id,
				completedAt: hub.stamp()
			}, { status: "ready" }, statements);
		} catch (e) {
			try {
				const hub = this.makeHub(), run = await hub.get(id);
				await hub.commit(actor, "Không đếm được keyframe", run, "kpi-count", {
					...run.data,
					error: (e instanceof Error ? e.message : "Không đọc được file").slice(0, 2e3)
				}, { status: "failed" });
			} catch {
				console.error("Cannot save keyframe count failure");
			}
		} finally {
			if (dir && dir.startsWith(workRoot + sep)) await rm(dir, {
				recursive: true,
				force: true
			}).catch(() => {});
		}
	}
	async close() {
		for (const job of this.jobs.values()) job.child?.kill();
		await Promise.allSettled([...this.jobs.values()].map((job) => job.promise));
	}
};
//#endregion
//#region drizzle/0000_sweet_white_queen.sql?raw
var _0000_sweet_white_queen_default = "CREATE TABLE `audit` (\n	`id` text PRIMARY KEY NOT NULL,\n	`actor_id` text NOT NULL,\n	`action` text NOT NULL,\n	`entity_id` text NOT NULL,\n	`before` text,\n	`after` text,\n	`created_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE TABLE `members` (\n	`id` text PRIMARY KEY NOT NULL,\n	`name` text NOT NULL,\n	`email` text NOT NULL,\n	`auth_id` text,\n	`role` text NOT NULL,\n	`state` text NOT NULL,\n	`invite_expires` text,\n	`created_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint\nCREATE UNIQUE INDEX `members_auth_id_unique` ON `members` (`auth_id`);--> statement-breakpoint\nCREATE TABLE `records` (\n	`id` text PRIMARY KEY NOT NULL,\n	`kind` text NOT NULL,\n	`natural_key` text NOT NULL,\n	`owner_id` text,\n	`project_id` text,\n	`task_id` text,\n	`date` text,\n	`status` text NOT NULL,\n	`revision` integer DEFAULT 1 NOT NULL,\n	`data` text NOT NULL,\n	`created_at` text NOT NULL,\n	`updated_at` text NOT NULL\n);\n--> statement-breakpoint\nCREATE UNIQUE INDEX `record_natural_key` ON `records` (`kind`,`natural_key`);--> statement-breakpoint\nCREATE INDEX `record_scope` ON `records` (`kind`,`owner_id`);--> statement-breakpoint\nCREATE INDEX `record_task` ON `records` (`task_id`);";
//#endregion
//#region self-host/server.ts
var LEAD_EMAIL = "26ai.khoint2@vinuni.edu.vn";
var BASE_HEADERS = {
	"X-Content-Type-Options": "nosniff",
	"Referrer-Policy": "no-referrer",
	"X-Frame-Options": "DENY",
	"Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
	"Permissions-Policy": "camera=(), microphone=(), geolocation=()",
	"Cache-Control": "no-store"
};
var json = (body, status = 200, headers = {}) => Response.json(body, {
	status,
	headers: {
		...BASE_HEADERS,
		...headers
	}
});
var redirect = (path, headers = {}) => new Response(null, {
	status: 303,
	headers: {
		...BASE_HEADERS,
		Location: path,
		...headers
	}
});
async function readJson(req, limit = 1024 * 1024) {
	ensure(Number(req.headers.get("content-length") || 0) <= limit, "Yêu cầu quá lớn", 413);
	const reader = req.body?.getReader();
	ensure(reader, "Thiếu dữ liệu");
	const chunks = [];
	let length = 0;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		length += value.length;
		if (length > limit) {
			await reader.cancel();
			throw new HubError("Yêu cầu quá lớn", 413);
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new HubError("JSON không hợp lệ");
	}
}
var LocalBucket = class {
	constructor(root) {
		this.root = root;
	}
	file(key) {
		ensure(/^files\/[a-f0-9-]{36}$/.test(key), "Mã tệp không hợp lệ");
		return join(this.root, key.slice(6));
	}
	async put(key, body) {
		await mkdir(this.root, {
			recursive: true,
			mode: 448
		});
		await writeFile(this.file(key), new Uint8Array(body), {
			flag: "wx",
			mode: 384
		});
	}
	async get(key) {
		try {
			return { body: new Uint8Array(await readFile(this.file(key))) };
		} catch (e) {
			if (e.code === "ENOENT") return null;
			throw e;
		}
	}
	async delete(key) {
		await rm(this.file(key), { force: true });
	}
};
async function createLocalApp(options) {
	const dataDir = resolve(options.dataDir), publicDir = resolve(options.publicDir), port = options.port || 3210;
	const startedAt = (/* @__PURE__ */ new Date()).toISOString();
	let buildId = null;
	try {
		buildId = JSON.parse(readFileSync(resolve(publicDir, "../build-manifest.json"), "utf8")).buildId || null;
	} catch {}
	await mkdir(dataDir, {
		recursive: true,
		mode: 448
	});
	const store = new SqliteStore(join(dataDir, "cuboid.sqlite"), _0000_sweet_white_queen_default);
	const now = options.now || (() => /* @__PURE__ */ new Date()), hub = new Hub(store, LEAD_EMAIL, now());
	if (!(await hub.members()).length) await hub.setup({
		userId: "local:member-0",
		email: LEAD_EMAIL
	});
	let instance = store.sql.prepare("SELECT value FROM selfhost_meta WHERE key='instance'").get()?.value;
	if (!instance) {
		instance = randomUUID();
		store.sql.prepare("INSERT INTO selfhost_meta VALUES('instance',?)").run(instance);
	}
	const auth = new LocalAuth(store);
	await auth.initialize();
	const basicQc = new BasicQcService(() => new Hub(store, LEAD_EMAIL, now()), dataDir, resolve(process.env.HUB_ROOT || "self-host"));
	await basicQc.initialize();
	const kpiCount = new KpiCountService(() => new Hub(store, LEAD_EMAIL, now()), dataDir, resolve(process.env.HUB_ROOT || "self-host"));
	await kpiCount.initialize();
	const refreshAttendance = () => new Hub(store, LEAD_EMAIL, now()).ensureAttendanceDefaults();
	await refreshAttendance();
	const attendanceTimer = setInterval(() => {
		refreshAttendance().catch((e) => console.error("Không thể tạo điểm danh mặc định:", e.message));
	}, 6e4);
	attendanceTimer.unref();
	const publicOrigin = () => {
		try {
			const value = (process.env.HUB_PUBLIC_ORIGIN || readFileSync(join(dataDir, "public-url.txt"), "utf8")).trim();
			const u = new URL(value);
			return u.protocol === "https:" && u.username === "" && u.password === "" && u.pathname === "/" ? u.origin : "";
		} catch {
			return "";
		}
	};
	const origins = () => new Set([
		`http://127.0.0.1:${port}`,
		`http://localhost:${port}`,
		...publicOrigin() ? [publicOrigin()] : []
	]);
	const localRequest = (req) => ["127.0.0.1", "localhost"].includes(new URL(req.url).hostname) && !req.headers.has("cf-connecting-ip") && !req.headers.has("x-forwarded-for");
	const ip = (req) => req.headers.get("cf-connecting-ip") || "loopback";
	const runtime = {
		DB: store,
		now,
		BUCKET: new LocalBucket(join(dataDir, "files")),
		LEAD_EMAIL,
		backupExtra: {
			authMode: "local",
			instanceId: instance
		},
		authenticate: async (req) => {
			const m = await auth.current(req);
			return m ? {
				userId: m.auth_id,
				email: m.email
			} : null;
		},
		afterMutation: (action, result, me, body, req) => auth.afterMutation(action, result, me, body, req, publicOrigin())
	};
	const memberInfo = (m) => ({
		id: m.id,
		name: m.name,
		username: m.email.split("@")[0],
		role: m.role
	});
	const bootstrapState = (m) => new Hub(store, LEAD_EMAIL, now()).state({
		userId: m.auth_id,
		email: m.email
	});
	async function restore(req, me) {
		hub.attendanceLead(me);
		const body = await readJson(req, 15 * 1024 * 1024), s = body.snapshot;
		ensure(body.confirm === "KHOI PHUC", "Cần nhập KHOI PHUC để xác nhận");
		ensure(s?.format === "cuboid-hub-v1" && s.authMode === "local" && s.instanceId === instance, "Bản sao lưu không thuộc bản tự host này");
		ensure(Array.isArray(s.members) && s.members.length <= 1e3 && Array.isArray(s.records) && s.records.length <= 5e4, "Bản sao lưu không hợp lệ");
		ensure(s.members.some((m) => m.id === me.id && m.role === "Lead" && m.state === "active"), "Cần giữ tài khoản Lead hiện tại");
		const members = s.members.map((m) => objectType({
			id: stringType().min(1).max(100),
			name: stringType().min(1).max(500),
			email: stringType().email(),
			role: enumType([
				"Lead",
				"QA/QC",
				"Annotator"
			]),
			state: enumType([
				"active",
				"invited",
				"pending",
				"disabled"
			]),
			created_at: stringType(),
			invite_expires: stringType().nullable()
		}).parse(m));
		const kinds = [
			"project",
			"task",
			"daily",
			"weekly",
			"attendance",
			"request",
			"review",
			"document",
			"settings",
			"kpi-exclusion",
			"kpi-rate",
			"target",
			"comment",
			"notification",
			"file",
			"import",
			"legacy",
			"qc-session",
			"qc-assignment",
			"qc-basic",
			"kpi-count",
			"kpi-source",
			"manual-rework",
			"weekly-snapshot",
			"qa-question",
			"qa-answer"
		];
		for (const r of s.records) ensure(kinds.includes(r.kind) && typeof r.id === "string" && typeof r.natural_key === "string" && r.data && typeof r.data === "object", "Bản ghi sao lưu không hợp lệ");
		store.transaction(() => {
			store.sql.prepare("DELETE FROM auth_sessions WHERE member_id!=?").run(me.id);
			store.sql.exec("DELETE FROM auth_tokens; DELETE FROM records;");
			const ids = new Set(members.map((m) => m.id));
			for (const old of store.sql.prepare("SELECT id FROM members").all()) if (!ids.has(old.id)) {
				store.sql.prepare("DELETE FROM auth_credentials WHERE member_id=?").run(old.id);
				store.sql.prepare("DELETE FROM members WHERE id=?").run(old.id);
			}
			for (const m of members) {
				const hasPassword = store.sql.prepare("SELECT 1 FROM auth_credentials WHERE member_id=?").get(m.id);
				const state = m.state === "active" && !hasPassword ? "pending" : m.state;
				store.sql.prepare("INSERT INTO members(id,name,email,auth_id,role,state,created_at,invite_expires) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,auth_id=excluded.auth_id,role=excluded.role,state=excluded.state,invite_expires=excluded.invite_expires").run(m.id, m.name, m.email, "local:" + m.id, m.role, state, m.created_at, m.invite_expires);
			}
			for (const r of s.records) store.sql.prepare("INSERT INTO records(id,kind,natural_key,owner_id,project_id,task_id,date,status,revision,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run(r.id, r.kind, r.natural_key, r.owner_id, r.project_id, r.task_id, r.date, r.status, r.revision, JSON.stringify(r.data), r.created_at, r.updated_at);
			store.sql.prepare("INSERT INTO audit VALUES(?,?,?,?,?,?,?)").run(randomUUID(), me.id, "Khôi phục dữ liệu tự host", "backup", null, JSON.stringify({
				createdAt: s.createdAt,
				records: s.records.length
			}), (/* @__PURE__ */ new Date()).toISOString());
		});
		return json({ ok: true });
	}
	async function handle(req) {
		try {
			const u = new URL(req.url);
			ensure(origins().has(u.origin), "Host không được phép", 403);
			const secure = u.protocol === "https:";
			if (!["GET", "HEAD"].includes(req.method)) ensure(req.headers.get("Origin") === u.origin && req.headers.get("Sec-Fetch-Site") !== "cross-site", "Yêu cầu không cùng nguồn", 403);
			if (u.pathname === "/api/health") return json({
				ok: true,
				service: "cuboid-self-host",
				auth: "local-password",
				buildId,
				startedAt
			});
			if (u.pathname === "/api/auth/me") {
				const m = await auth.current(req);
				return json({
					authenticated: !!m,
					setupRequired: !auth.isSetup(),
					localSetupAllowed: localRequest(req),
					member: m ? memberInfo(m) : null,
					...m && u.searchParams.get("bootstrap") === "1" ? { hubState: await bootstrapState(m) } : {}
				});
			}
			if (u.pathname === "/api/auth/login" && req.method === "POST") {
				const b = await readJson(req, 4096);
				const r = await auth.login(b.username, b.password, ip(req));
				return json({
					ok: true,
					...b.bootstrap === true ? {
						authenticated: true,
						member: memberInfo(r.member),
						hubState: await bootstrapState(r.member)
					} : {}
				}, 200, { "Set-Cookie": sessionCookie(r.token, secure) });
			}
			if (u.pathname === "/api/auth/setup" && req.method === "POST") {
				ensure(localRequest(req) && !auth.isSetup(), "Chỉ được thiết lập Lead từ trình duyệt trên máy host", 403);
				auth.limit("setup:" + ip(req), 12);
				const b = await readJson(req, 4096);
				return json({ ok: true }, 200, { "Set-Cookie": sessionCookie((await auth.consume(cookieValue(req, "cuboid_setup"), b.password)).token, false) });
			}
			if (u.pathname === "/api/auth/token" && req.method === "GET") {
				auth.limit("token-info:" + ip(req), 100);
				const info = auth.tokenInfo(u.searchParams.get("token") || "");
				ensure(info.purpose !== "setup", "Liên kết không hợp lệ", 403);
				return json({
					name: info.name,
					username: info.email.split("@")[0],
					purpose: info.purpose,
					expires: new Date(info.expires_at).toISOString()
				});
			}
			if (u.pathname === "/api/auth/activate" && req.method === "POST") {
				auth.limit("activate:" + ip(req), 15);
				const b = await readJson(req, 4096);
				ensure(auth.tokenInfo(b.token || "").purpose !== "setup", "Liên kết không hợp lệ", 403);
				return json({ ok: true }, 200, { "Set-Cookie": sessionCookie((await auth.consume(b.token, b.password)).token, secure) });
			}
			if (u.pathname === "/api/auth/reset" && req.method === "POST") {
				const me = await auth.current(req);
				ensure(me, "Vui lòng đăng nhập", 401);
				hub.lead(me);
				const b = await readJson(req, 4096);
				const member = (await hub.members()).find((m) => m.id === b.memberId);
				ensure(member && member.state === "active", "Tài khoản cần đang hoạt động");
				ensure(member.id !== "member-0" || me.id === "member-0", "Chỉ Khôi được khôi phục tài khoản của Khôi", 403);
				const token = auth.issue(member.id, "reset", .5);
				await store.batch([hub.audit(me.id, "Tạo liên kết khôi phục mật khẩu", member.id, null, { expires: token.expires })]);
				return json({
					ok: true,
					invitationUrl: `${publicOrigin() || u.origin}/auth/activate?token=${token.token}`,
					username: member.email.split("@")[0],
					inviteExpires: token.expires
				});
			}
			if (u.pathname === "/api/auth/change-password" && req.method === "POST") {
				const me = await auth.current(req);
				ensure(me, "Vui lòng đăng nhập", 401);
				const b = await readJson(req, 4096);
				return json({ ok: true }, 200, { "Set-Cookie": sessionCookie((await auth.changePassword(me, b.currentPassword, b.password)).token, secure) });
			}
			if (u.pathname === "/auth/logout") {
				auth.logout(req);
				return redirect("/auth/login", { "Set-Cookie": sessionCookie("", secure, 0) });
			}
			if (u.pathname === "/api/hub/restore" && req.method === "POST") {
				const me = await auth.current(req);
				ensure(me, "Vui lòng đăng nhập", 401);
				return await restore(req, me);
			}
			if (u.pathname.startsWith("/api/hub/qc-basic/")) {
				const me = await auth.current(req);
				ensure(me, "Vui lòng đăng nhập", 401);
				return await basicQc.handle(req, me);
			}
			if (u.pathname.startsWith("/api/hub/kpi-count/")) {
				const me = await auth.current(req);
				ensure(me, "Vui lòng đăng nhập", 401);
				return await kpiCount.handle(req, me);
			}
			if (u.pathname.startsWith("/api/hub/")) return await handleHub(req, runtime);
			if (u.pathname.startsWith("/api/")) return json({ error: "Không tìm thấy" }, 404);
			if (req.method !== "GET" && req.method !== "HEAD") return json({ error: "Phương thức không hợp lệ" }, 405);
			if (u.pathname === "/" && !auth.isSetup() && localRequest(req)) return redirect("/auth/setup");
			let setupCookie = "";
			if (u.pathname === "/auth/setup") {
				ensure(localRequest(req), "Thiết lập Lead chỉ thực hiện trực tiếp trên máy host", 403);
				if (auth.isSetup()) return redirect("/auth/login");
				setupCookie = `cuboid_setup=${auth.issue("member-0", "setup", .5).token}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=1800`;
			}
			let file = resolve(publicDir, "." + decodeURIComponent(u.pathname));
			ensure(file === publicDir || file.startsWith(publicDir + sep), "Đường dẫn không hợp lệ", 404);
			if (u.pathname === "/" || u.pathname.startsWith("/auth/")) file = join(publicDir, "index.html");
			try {
				ensure((await stat(file)).isFile(), "Không tìm thấy", 404);
			} catch {
				throw new HubError("Không tìm thấy", 404);
			}
			const types = {
				".html": "text/html;charset=utf-8",
				".js": "text/javascript;charset=utf-8",
				".css": "text/css;charset=utf-8",
				".svg": "image/svg+xml",
				".png": "image/png",
				".ico": "image/x-icon",
				".woff2": "font/woff2"
			};
			return new Response(req.method === "HEAD" ? null : new Uint8Array(await readFile(file)), { headers: {
				...BASE_HEADERS,
				"Content-Type": types[extname(file)] || "application/octet-stream",
				...setupCookie ? { "Set-Cookie": setupCookie } : {},
				...u.pathname.startsWith("/assets/") ? { "Cache-Control": "public,max-age=31536000,immutable" } : {}
			} });
		} catch (e) {
			if (e instanceof HubError) return json({ error: e.message }, e.status);
			if (e instanceof ZodError) return json({ error: e.issues.map((i) => i.message).join("; ") }, 400);
			console.error("Request failed:", e?.message);
			return json({ error: "Không thể xử lý yêu cầu. Vui lòng thử lại." }, 500);
		}
	}
	const server = createServer({
		maxHeaderSize: 16384,
		requestTimeout: 3e4,
		headersTimeout: 15e3
	}, async (incoming, out) => {
		try {
			const host = incoming.headers.host || "";
			const publicUrl = publicOrigin();
			const origin = publicUrl && host === new URL(publicUrl).host ? publicUrl : `http://${host}`;
			ensure(origins().has(origin), "Host không được phép", 403);
			ensure(incoming.url?.startsWith("/") && !incoming.url.startsWith("//"), "Đường dẫn không hợp lệ", 400);
			const init = {
				method: incoming.method,
				headers: incoming.headers
			};
			if (!["GET", "HEAD"].includes(incoming.method || "GET")) {
				init.body = Readable.toWeb(incoming);
				init.duplex = "half";
			}
			const response = await handle(new Request(origin + incoming.url, init));
			out.writeHead(response.status, Object.fromEntries(response.headers));
			if (response.body) Readable.fromWeb(response.body).pipe(out);
			else out.end();
		} catch (e) {
			out.writeHead(e instanceof HubError ? e.status : 500, {
				...BASE_HEADERS,
				"Content-Type": "application/json"
			});
			out.end(JSON.stringify({ error: e instanceof HubError ? e.message : "Không thể xử lý yêu cầu" }));
		}
	});
	return {
		server,
		store,
		auth,
		hub,
		handle,
		instance,
		publicOrigin,
		refreshAttendance,
		close: async () => {
			clearInterval(attendanceTimer);
			await Promise.allSettled([basicQc.close(), kpiCount.close()]);
			await new Promise((resolve) => server.close(() => resolve()));
			store.close();
		}
	};
}
if (process.env.HUB_NO_LISTEN !== "1") {
	const port = Number(process.env.HUB_PORT || 3210);
	const base = process.env.HUB_ROOT || fileURLToPath(new URL("../../", import.meta.url));
	const { applyPublishedData } = await import(
		/* @vite-ignore */
		pathToFileURL(join(base, "repo-data-update.mjs")).href
);
	await applyPublishedData({
		root: base,
		dataDir: process.env.HUB_DATA_DIR || join(base, "data"),
		port
	});
	const app = await createLocalApp({
		dataDir: process.env.HUB_DATA_DIR || join(base, "data"),
		publicDir: process.env.HUB_PUBLIC_DIR || join(base, "dist/client"),
		port
	});
	app.server.on("error", (e) => {
		console.error("Không thể mở máy chủ:", e.message);
		process.exitCode = 1;
	});
	app.server.listen(port, "127.0.0.1", () => console.log(`Cuboid Team Hub tự host: http://127.0.0.1:${port}\nĐăng nhập bằng tài khoản riêng. Dữ liệu: ${resolve(process.env.HUB_DATA_DIR || join(base, "data"))}`));
	setInterval(() => app.auth.cleanup(), 15 * 6e4).unref();
	for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
		app.close().then(() => process.exit(0));
	});
}
//#endregion
export { BASE_HEADERS, createLocalApp };
