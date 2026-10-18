/**
 * dsh-cost-slip —— 宿主端会话投影。
 *
 * 每收到一条已结算的 assistant 回复，就按它的 token 用量、模型和该条回复的时间
 * （高峰 / 空闲价）累加费用，得到整个会话的估算费用（单位：微元，1e-6 元）。
 * 客户端插件 dsh-cost-slip 在输入框底部统计行里读这个投影并显示“费用 ¥x.xx”。
 *
 * 为什么放在宿主端：
 *   · 会话事件里有每条回复的 usage、model、time，能精确到每一条；
 *   · 客户端现成的 tokenUsage 投影只有总量，没有模型和时间，算不准峰谷价；
 *   · 投影会随会话日志重放，刷新 / 重开页面后数字不变。
 */

import { z } from "zod";
import { pricesAt } from "./pricing.js";

/** 费用分项：命中缓存输入 / 未命中输入 / 缓存写入 / 输出，单位微元。 */
const costSchema = z.object({
	hit: z.number().int().nonnegative(),
	miss: z.number().int().nonnegative(),
	write: z.number().int().nonnegative(),
	out: z.number().int().nonnegative(),
	total: z.number().int().nonnegative()
}).strict();

/** token 分项，字段与 usage 对齐。 */
const tokenSchema = z.object({
	hit: z.number().int().nonnegative(),
	miss: z.number().int().nonnegative(),
	write: z.number().int().nonnegative(),
	out: z.number().int().nonnegative()
}).strict();

/** 上一条被计价样本，用于同一步骤重报时“先减后加”。 */
const lastSampleSchema = z.object({
	turn: z.number().int().nonnegative(),
	step: z.number().int().nonnegative(),
	buckets: z.object({
		uncachedInputTokens: z.number().int().nonnegative(),
		cacheReadTokens: z.number().int().nonnegative(),
		cacheWriteTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative()
	}).strict(),
	cost: costSchema,
	costTokens: tokenSchema
}).strict();

/** 持久化状态（也会被投影缓存写入磁盘，读取时按此 schema 校验）。 */
const stateSchema = z.object({
	cost: costSchema,
	tokens: tokenSchema,
	last: lastSampleSchema.nullable(),
	route: z.object({
		provider: z.string(),
		model: z.string()
	}).strict().nullable(),
	lastPeak: z.boolean().nullable(),
	lastTime: z.number().int().nonnegative().nullable(),
	samples: z.number().int().nonnegative()
}).strict();

/** 下发到客户端的视图。 */
const viewSchema = z.object({
	totalMicros: z.number().int().nonnegative(),
	hitMicros: z.number().int().nonnegative(),
	missMicros: z.number().int().nonnegative(),
	writeMicros: z.number().int().nonnegative(),
	outMicros: z.number().int().nonnegative(),
	hitTokens: z.number().int().nonnegative(),
	missTokens: z.number().int().nonnegative(),
	writeTokens: z.number().int().nonnegative(),
	outTokens: z.number().int().nonnegative(),
	lastPeak: z.boolean().nullable(),
	lastTime: z.number().int().nonnegative().nullable(),
	samples: z.number().int().nonnegative()
}).strict();

const emptyCost = () => ({ hit: 0, miss: 0, write: 0, out: 0, total: 0 });
const emptyTokens = () => ({ hit: 0, miss: 0, write: 0, out: 0 });

const isCount = (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/**
 * 取一条结算事件里的 usage。与 dsh-token-meter 的取法保持一致：
 * assistant/message 用 data.usage；assistant/attempt 用 stream 里最后一个 usage 块。
 * @param {object} event - 会话事件。
 * @returns {object | undefined} usage 原始对象。
 */
function usageOf(event) {
	if (event.type === "assistant/message" && event.data?.usage !== undefined) return event.data.usage;
	const stream = event.data?.stream;
	if (!Array.isArray(stream)) return undefined;
	for (let index = stream.length - 1; index >= 0; index -= 1) {
		const record = stream[index];
		if (record?.type === "chunk" && record.chunk?.type === "usage") return record.chunk.usage;
	}
	return undefined;
}

/**
 * 把 provider usage 归一成四个计费桶；缺字段按 0，非法值整条丢弃。
 * @param {unknown} usage - usage 原始对象。
 * @returns {{uncachedInputTokens:number,cacheReadTokens:number,cacheWriteTokens:number,outputTokens:number} | null}
 */
function normalizeUsage(usage) {
	if (typeof usage !== "object" || usage === null) return null;
	const input = usage.inputTokens;
	const output = usage.outputTokens;
	const read = usage.cacheReadTokens === undefined ? 0 : usage.cacheReadTokens;
	const write = usage.cacheWriteTokens === undefined ? 0 : usage.cacheWriteTokens;
	if (!isCount(input) || !isCount(output) || !isCount(read) || !isCount(write)) return null;
	return {
		uncachedInputTokens: input,
		cacheReadTokens: read,
		cacheWriteTokens: write,
		outputTokens: output
	};
}

const sameBuckets = (left, right) => left.uncachedInputTokens === right.uncachedInputTokens
	&& left.cacheReadTokens === right.cacheReadTokens
	&& left.cacheWriteTokens === right.cacheWriteTokens
	&& left.outputTokens === right.outputTokens;

/**
 * 归一化后的 usage 只在这里的一处换成钱：token 数 × 元/百万 token = 微元。
 * 每个分项四舍五入到 1 微元，累加误差可以忽略。
 */
function costOf(buckets, prices) {
	const hit = Math.round(buckets.cacheReadTokens * prices.hit);
	const miss = Math.round(buckets.uncachedInputTokens * prices.miss);
	// 官方未单独收取缓存写入费；若出现写入 token，按未命中价保守估算。
	const write = Math.round(buckets.cacheWriteTokens * prices.miss);
	const out = Math.round(buckets.outputTokens * prices.out);
	return {
		hit,
		miss,
		write,
		out,
		total: hit + miss + write + out
	};
}

const addCost = (left, right) => ({
	hit: left.hit + right.hit,
	miss: left.miss + right.miss,
	write: left.write + right.write,
	out: left.out + right.out,
	total: left.total + right.total
});

const subtractCost = (left, right) => ({
	hit: left.hit - right.hit,
	miss: left.miss - right.miss,
	write: left.write - right.write,
	out: left.out - right.out,
	total: left.total - right.total
});

const addTokens = (left, right) => ({
	hit: left.hit + right.hit,
	miss: left.miss + right.miss,
	write: left.write + right.write,
	out: left.out + right.out
});

const subtractTokens = (left, right) => ({
	hit: left.hit - right.hit,
	miss: left.miss - right.miss,
	write: left.write - right.write,
	out: left.out - right.out
});

const tokensOf = (buckets) => ({
	hit: buckets.cacheReadTokens,
	miss: buckets.uncachedInputTokens,
	write: buckets.cacheWriteTokens,
	out: buckets.outputTokens
});

/**
 * 每条结算事件归属的模型。
 * @param {object} event - 会话事件。
 * @param {object | null} route - 最近一次 request/header 的 provider/model。
 * @returns {string} 模型 id；未知时退回 Flash。
 */
function modelOf(event, route) {
	const sourceModel = event.type === "assistant/message" ? event.data?.message?.source?.model : undefined;
	if (typeof sourceModel === "string" && sourceModel.length > 0) return sourceModel;
	if (route !== null && route.model.length > 0) return route.model;
	return "deepseek-flash";
}

/** dsh-cost-slip 的投影单元。 */
const sessionCostProjection = {
	key: "sessionCost",
	stateVersion: 1,
	stateSchema,
	init: () => ({
		cost: emptyCost(),
		tokens: emptyTokens(),
		last: null,
		route: null,
		lastPeak: null,
		lastTime: null,
		samples: 0
	}),
	apply: (state, event) => {
		if (event.type === "request/header") {
			const config = event.data?.header?.config;
			const model = typeof config?.model === "string" ? config.model : "";
			if (model.length === 0) return state;
			return {
				...state,
				route: {
					provider: typeof config?.provider === "string" ? config.provider : "",
					model
				}
			};
		}
		// 重试：上一条样本已经计过费，保留它；清掉 last，让下一次 attempt 是“新增”而不是“替换”。
		if (event.type === "llm/retry-started") {
			if (state.last !== null && state.last.turn === event.data?.turn && state.last.step === event.data?.step) return {
				...state,
				last: null
			};
			return state;
		}
		if (event.type !== "assistant/message" && event.type !== "assistant/attempt") return state;
		const turn = event.data?.turn;
		const step = event.data?.step;
		if (!isCount(turn) || !isCount(step)) return state;
		const buckets = normalizeUsage(usageOf(event));
		if (buckets === null) return state;
		const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null;
		if (previous !== null && sameBuckets(previous.buckets, buckets)) return state;
		const model = modelOf(event, state.route);
		const prices = pricesAt(model, event.time);
		const cost = costOf(buckets, prices);
		const tokens = tokensOf(buckets);
		return {
			...state,
			cost: previous === null
				? addCost(state.cost, cost)
				: addCost(subtractCost(state.cost, previous.cost), cost),
			tokens: previous === null
				? addTokens(state.tokens, tokens)
				: addTokens(subtractTokens(state.tokens, previous.costTokens ?? tokens), tokens),
			last: {
				turn,
				step,
				buckets,
				cost,
				// 保存这一条样本的 token 分项，重报时才能准确减掉。
				costTokens: tokens
			},
			lastPeak: prices.peak,
			lastTime: event.time,
			samples: previous === null ? state.samples + 1 : state.samples
		};
	},
	wire: {
		viewSchema,
		view: (state) => ({
			totalMicros: state.cost.total,
			hitMicros: state.cost.hit,
			missMicros: state.cost.miss,
			writeMicros: state.cost.write,
			outMicros: state.cost.out,
			hitTokens: state.tokens.hit,
			missTokens: state.tokens.miss,
			writeTokens: state.tokens.write,
			outTokens: state.tokens.out,
			lastPeak: state.lastPeak,
			lastTime: state.lastTime,
			samples: state.samples
		})
	}
};

export const name = "session-cost";

/** 没有投影注册表就不需要挂载这个插件。 */
export const inject = ["sessionProjections"];

/**
 * 注册会话费用投影。
 * @param {object} ctx - 宿主 Cordis 上下文。
 */
export function apply(ctx) {
	ctx.sessionProjections.register(sessionCostProjection);
}
