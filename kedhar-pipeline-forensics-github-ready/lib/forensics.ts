export type EventRecord = Record<string, unknown> & {
  timestamp: string;
  stage: string;
  status: string;
  latency_ms: number;
  retry: number;
};

export type Hypothesis = {
  rule: string;
  title: string;
  hypothesis: string;
  score: number;
  evidence: string[];
  contain: string[];
  prevent: string[];
};

export type Analysis = {
  schemaVersion: string;
  engine: string;
  caseId: string;
  fingerprint: string;
  runId: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  eventCount: number;
  severity: { code: string; label: string; tone: string };
  confidence: number;
  primaryFailure: { stage: string; category: string; message: string };
  blastRadius: { stages: number; affected: string[]; label: string };
  chain: Array<{ stage: string; status: string; latencyMs: number }>;
  hypotheses: Hypothesis[];
  evidence: Array<{
    timestamp: string;
    stage: string;
    status: string;
    detail: string;
  }>;
  response: { contain: string[]; prevent: string[] };
  events: EventRecord[];
};

export const RULEBOOK = [
  {
    id: "context-overflow",
    label: "Context overflow",
    description: "Prompt or context exceeds the model input limit.",
    signal: "context length · token limit · max context",
  },
  {
    id: "rate-limit",
    label: "Provider throttling",
    description: "Requests are refused by a model or API quota boundary.",
    signal: "HTTP 429 · rate limit · quota",
  },
  {
    id: "schema-contract",
    label: "Schema contract",
    description: "A stage emits data that its next consumer cannot validate.",
    signal: "schema · parse · validation · malformed JSON",
  },
  {
    id: "retrieval-quality",
    label: "Retrieval quality",
    description: "Retrieval produces empty, sparse, or low-confidence evidence.",
    signal: "0 documents · low score · no context",
  },
  {
    id: "retry-storm",
    label: "Retry storm",
    description: "Repeated attempts amplify a failure without changing conditions.",
    signal: "retry ≥ 2 · repeated stage errors",
  },
  {
    id: "latency-regression",
    label: "Latency regression",
    description: "A stage crosses its declared latency budget or times out.",
    signal: "latency > budget · timeout",
  },
  {
    id: "auth-config",
    label: "Auth / configuration",
    description: "Credentials, endpoints, models, or environment values are rejected.",
    signal: "HTTP 401/403 · invalid key · model not found",
  },
  {
    id: "cascade",
    label: "Failure cascade",
    description: "A primary failure blocks or corrupts dependent downstream stages.",
    signal: "downstream failures within 90 seconds",
  },
];

export const sampleTrace = [
  {
    timestamp: "2026-07-23T18:04:12.102Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "request_ingest",
    status: "success",
    latency_ms: 18,
    message: "Request accepted",
  },
  {
    timestamp: "2026-07-23T18:04:12.184Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "query_rewrite",
    status: "success",
    latency_ms: 81,
  },
  {
    timestamp: "2026-07-23T18:04:12.421Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "vector_retrieval",
    status: "success",
    latency_ms: 236,
    documents: 32,
    top_score: 0.82,
  },
  {
    timestamp: "2026-07-23T18:04:12.633Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "reranker",
    status: "success",
    latency_ms: 211,
    documents: 20,
  },
  {
    timestamp: "2026-07-23T18:04:12.649Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "prompt_builder",
    status: "warning",
    latency_ms: 15,
    prompt_tokens: 16740,
    model_limit: 16384,
    message: "Assembled prompt exceeds declared model context",
  },
  {
    timestamp: "2026-07-23T18:04:13.114Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "llm_inference",
    status: "error",
    latency_ms: 464,
    retry: 1,
    model: "model-small-16k",
    error_code: "context_length_exceeded",
    error: "Maximum context length is 16384 tokens; request contained 16740 input tokens",
    customer_impact: true,
  },
  {
    timestamp: "2026-07-23T18:04:13.921Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "llm_inference",
    status: "error",
    latency_ms: 806,
    retry: 2,
    error: "Retry failed: context length exceeded; prompt was unchanged",
    customer_impact: true,
  },
  {
    timestamp: "2026-07-23T18:04:13.934Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "answer_synthesis",
    status: "blocked",
    latency_ms: 0,
    reason: "No model output available",
  },
  {
    timestamp: "2026-07-23T18:04:13.949Z",
    run_id: "rag-prod-7f31",
    environment: "production",
    stage: "response_gateway",
    status: "error",
    latency_ms: 14,
    error: "Pipeline terminated after upstream inference failure",
    customer_impact: true,
  },
];

function stringValue(value: unknown) {
  return value === undefined || value === null ? "" : String(value);
}

function numberValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function textOf(event: Record<string, unknown>) {
  return ["error", "message", "detail", "reason", "error_code", "status_code"]
    .map((key) => stringValue(event[key]))
    .join(" ")
    .toLowerCase();
}

function stableHash(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function normalizeStatus(value: unknown) {
  const status = stringValue(value || "unknown").toLowerCase();
  if (["success", "completed", "ok"].includes(status)) return "success";
  if (["warning", "warn", "degraded", "retrying"].includes(status)) return "warning";
  if (status === "blocked") return "blocked";
  if (["error", "failed", "failure", "timeout"].includes(status)) return "error";
  return status;
}

function parseTrace(input: string | object[]) {
  if (Array.isArray(input)) return input;
  const raw = String(input || "").trim();
  if (!raw) throw new Error("The trace is empty.");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (Array.isArray(record.events)) return record.events;
      if (Array.isArray(record.trace)) return record.trace;
      return [record];
    }
  } catch {
    try {
      return raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line) as object);
    } catch {
      throw new Error("Invalid JSON or JSONL. Check the first malformed line.");
    }
  }
  throw new Error("The trace must contain JSON events.");
}

function normalize(input: string | object[]) {
  const events = parseTrace(input);
  if (!events.length) throw new Error("At least one event is required.");
  return events
    .map((source, index) => {
      if (!source || typeof source !== "object") {
        throw new Error(`Event ${index + 1} must be a JSON object.`);
      }
      const event = source as Record<string, unknown>;
      const rawTime =
        event.timestamp || event.time || event.ts || event.created_at || event.started_at;
      const timestamp = rawTime ? new Date(stringValue(rawTime)) : new Date(index * 1000);
      if (Number.isNaN(timestamp.getTime())) {
        throw new Error(`Event ${index + 1} has an invalid timestamp.`);
      }
      return {
        ...event,
        timestamp: timestamp.toISOString(),
        stage: stringValue(
          event.stage ||
            event.step ||
            event.component ||
            event.service ||
            event.name ||
            `stage_${index + 1}`,
        ),
        status: normalizeStatus(event.status || event.level || event.outcome),
        latency_ms: numberValue(
          event.latency_ms || event.duration_ms || event.elapsed_ms,
        ),
        retry: numberValue(event.retry || event.attempt || event.retry_count),
      } as EventRecord;
    })
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp));
}

function candidate(
  rule: string,
  title: string,
  hypothesis: string,
  score: number,
  evidence: string[],
  contain: string[],
  prevent: string[],
): Hypothesis {
  return {
    rule,
    title,
    hypothesis,
    score: Math.min(99, score),
    evidence: [...new Set(evidence)],
    contain,
    prevent,
  };
}

function eventEvidence(event: EventRecord) {
  const detail =
    event.error || event.message || event.reason || event.detail || event.status;
  return `${event.stage} @ ${event.timestamp}: ${stringValue(detail)}`;
}

function detect(events: EventRecord[]) {
  const results: Hypothesis[] = [];
  const failures = events.filter((event) => event.status === "error");

  const context = events.filter(
    (event) =>
      /(context.{0,12}(length|limit|window)|maximum context|too many tokens|token.{0,12}(limit|exceed))/i.test(
        textOf(event),
      ) ||
      (numberValue(event.model_limit || event.context_limit) > 0 &&
        numberValue(event.prompt_tokens || event.input_tokens) >
          numberValue(event.model_limit || event.context_limit)),
  );
  if (context.length) {
    results.push(
      candidate(
        "context-overflow",
        "Prompt context exceeded the model window",
        "The assembled prompt grew beyond the selected model's accepted input size, so retries repeated an invalid request.",
        94 + Math.min(4, context.length),
        context.map(eventEvidence),
        [
          "Cap retrieved chunks and truncate context before the model call.",
          "Route the failed request to a model with a larger context window.",
        ],
        [
          "Add a token-budget gate between prompt assembly and inference.",
          "Track prompt-token percentiles by prompt version.",
        ],
      ),
    );
  }

  const rate = events.filter((event) =>
    /(\b429\b|rate.?limit|quota|too many requests|throttl)/i.test(textOf(event)),
  );
  if (rate.length) {
    results.push(
      candidate(
        "rate-limit",
        "Provider capacity or quota was exhausted",
        "The upstream provider refused one or more requests at its throughput boundary.",
        91 + Math.min(7, rate.length),
        rate.map(eventEvidence),
        [
          "Apply exponential backoff with jitter and honor retry-after.",
          "Temporarily reduce worker concurrency.",
        ],
        [
          "Add per-model token-bucket limits and quota alerts.",
          "Introduce a bounded provider fallback.",
        ],
      ),
    );
  }

  const schema = events.filter((event) =>
    /(schema|validation|parse|malformed|invalid json|json decode|type mismatch)/i.test(
      textOf(event),
    ),
  );
  if (schema.length) {
    results.push(
      candidate(
        "schema-contract",
        "A stage boundary broke its data contract",
        "An upstream output did not match the structure expected by its downstream consumer.",
        88 + Math.min(9, schema.length * 2),
        schema.map(eventEvidence),
        [
          "Quarantine the incompatible payload.",
          "Roll back the changed prompt or component version.",
        ],
        [
          "Validate outputs at every stage boundary.",
          "Add contract tests for prompt, tool, and parser changes.",
        ],
      ),
    );
  }

  const retrieval = events.filter((event) => {
    const count = event.documents ?? event.result_count ?? event.chunks ?? event.hits;
    const score = event.top_score ?? event.relevance_score ?? event.similarity;
    return (
      /(no (documents|results|context)|empty retrieval|low relevance)/i.test(
        textOf(event),
      ) ||
      (count !== undefined && numberValue(count) === 0) ||
      (score !== undefined && numberValue(score) > 0 && numberValue(score) < 0.25)
    );
  });
  if (retrieval.length) {
    results.push(
      candidate(
        "retrieval-quality",
        "Retrieval returned insufficient grounding",
        "The pipeline continued without enough relevant evidence for a reliable answer.",
        78 + Math.min(15, retrieval.length * 3),
        retrieval.map(eventEvidence),
        [
          "Return a safe no-answer response.",
          "Retry retrieval with a broader query once.",
        ],
        [
          "Introduce a minimum document-count and relevance gate.",
          "Benchmark retrieval quality by index version.",
        ],
      ),
    );
  }

  const auth = events.filter((event) =>
    /(\b401\b|\b403\b|unauthori[sz]ed|forbidden|invalid.{0,8}(api|key|token)|model not found|unknown model)/i.test(
      textOf(event),
    ),
  );
  if (auth.length) {
    results.push(
      candidate(
        "auth-config",
        "Provider configuration was rejected",
        "A credential, model identifier, or endpoint was invalid for the environment.",
        92 + Math.min(6, auth.length),
        auth.map(eventEvidence),
        [
          "Roll back to the last working provider configuration.",
          "Verify the secret reference and selected model.",
        ],
        [
          "Run a provider capability check during deployment.",
          "Alert on expiring credentials without exposing values.",
        ],
      ),
    );
  }

  const latency = events.filter((event) => {
    const budget = numberValue(
      event.latency_budget_ms || event.timeout_ms || event.slo_ms,
    );
    return (
      (event.status === "error" && /timeout|deadline/i.test(textOf(event))) ||
      (budget > 0 && event.latency_ms > budget)
    );
  });
  if (latency.length) {
    results.push(
      candidate(
        "latency-regression",
        "A stage exceeded its execution budget",
        "The pipeline crossed a latency or deadline boundary before producing a usable result.",
        86 + Math.min(11, latency.length * 2),
        latency.map(eventEvidence),
        [
          "Use a bounded fallback for the slow stage.",
          "Stop retries when the parent request has no time budget.",
        ],
        [
          "Set stage budgets that roll up to the end-to-end SLO.",
          "Alert on latency distribution shifts.",
        ],
      ),
    );
  }

  const attempts = new Map<string, number>();
  events.forEach((event) => {
    if (event.retry > 1 || event.status === "error") {
      attempts.set(event.stage, (attempts.get(event.stage) || 0) + 1);
    }
  });
  const storm = [...attempts].filter(([, count]) => count >= 2);
  if (storm.length) {
    results.push(
      candidate(
        "retry-storm",
        "Retries amplified the original failure",
        "The pipeline repeated an unchanged failing operation, adding latency and load.",
        70 + Math.min(18, storm.reduce((sum, item) => sum + item[1], 0) * 3),
        storm.map(([stage, count]) => `${stage}: ${count} failed or repeated attempts`),
        [
          "Open the circuit for the failing stage.",
          "Preserve the first error as the canonical signal.",
        ],
        [
          "Retry only errors marked transient.",
          "Set a pipeline-wide retry budget.",
        ],
      ),
    );
  }

  if (failures.length > 1) {
    results.push(
      candidate(
        "cascade",
        "The first error propagated downstream",
        "Dependent stages failed or became blocked shortly after the primary error.",
        66 + Math.min(20, (failures.length - 1) * 5),
        failures.slice(0, 4).map(eventEvidence),
        [
          "Short-circuit dependent stages after the primary failure.",
          "Return a typed partial-failure response.",
        ],
        [
          "Add explicit dependency guards.",
          "Measure blast radius in every incident review.",
        ],
      ),
    );
  }

  if (failures.length && !results.length) {
    results.push(
      candidate(
        "runtime-failure",
        `Runtime failure isolated to ${failures[0].stage}`,
        "The trace has a failure but insufficient structured evidence for a narrower class.",
        52,
        failures.slice(0, 4).map(eventEvidence),
        ["Inspect the first failing event and preserve its full stack."],
        ["Emit structured error codes and stage metadata."],
      ),
    );
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function analyzeTrace(input: string | object[]): Analysis {
  const events = normalize(input);
  const hypotheses = detect(events);
  const failures = events.filter((event) => event.status === "error");
  const firstFailure =
    failures[0] || events.find((event) => event.status === "blocked");
  const failureIndex = firstFailure ? events.indexOf(firstFailure) : -1;
  const affected = [
    ...new Set(
      failureIndex >= 0
        ? events
            .slice(failureIndex)
            .filter((event) => event.status !== "success")
            .map((event) => event.stage)
        : [],
    ),
  ];
  const fingerprint = stableHash(
    [
      firstFailure?.stage,
      hypotheses[0]?.rule,
      textOf(firstFailure || {}),
      events.map((event) => `${event.stage}:${event.status}`).join("|"),
    ].join("::"),
  );
  const highImpact = events.some(
    (event) =>
      event.customer_impact === true ||
      /production|prod/i.test(stringValue(event.environment)),
  );
  const severity =
    (highImpact && failures.length) ||
    failures.length >= 3 ||
    ((hypotheses[0]?.score || 0) >= 94 && affected.length >= 2)
      ? { code: "P1", label: "CRITICAL", tone: "critical" }
      : failures.length
        ? { code: "P2", label: "HIGH", tone: "warning" }
        : hypotheses.length
          ? { code: "P3", label: "DEGRADED", tone: "warning" }
          : { code: "P4", label: "HEALTHY RUN", tone: "healthy" };

  const chain: Analysis["chain"] = [];
  events.forEach((event) => {
    const previous = chain.at(-1);
    if (previous?.stage === event.stage) {
      previous.latencyMs += event.latency_ms;
      if (event.status === "error" || previous.status !== "error") {
        previous.status = event.status;
      }
    } else {
      chain.push({
        stage: event.stage,
        status: event.status,
        latencyMs: event.latency_ms,
      });
    }
  });

  const runId =
    stringValue(events.find((event) => event.run_id)?.run_id) ||
    stringValue(events.find((event) => event.trace_id)?.trace_id) ||
    `run-${fingerprint.slice(0, 6).toLowerCase()}`;
  const contain = [
    ...new Set(hypotheses.slice(0, 2).flatMap((item) => item.contain)),
  ].slice(0, 4);
  const prevent = [
    ...new Set(hypotheses.slice(0, 2).flatMap((item) => item.prevent)),
  ].slice(0, 4);

  return {
    schemaVersion: "1.0",
    engine: "Kedhar Pipeline Forensics",
    caseId: `KPF-${fingerprint.slice(0, 4)}`,
    fingerprint,
    runId,
    startedAt: events[0].timestamp,
    endedAt: events.at(-1)!.timestamp,
    durationMs: Math.max(
      0,
      +new Date(events.at(-1)!.timestamp) - +new Date(events[0].timestamp),
    ),
    eventCount: events.length,
    severity,
    confidence: hypotheses[0]
      ? Math.min(99, Math.max(35, hypotheses[0].score))
      : 20,
    primaryFailure: {
      stage: firstFailure?.stage || "none",
      category: hypotheses[0]?.rule || "no-failure",
      message: stringValue(
        firstFailure?.error ||
          firstFailure?.message ||
          "No terminal failure detected",
      ),
    },
    blastRadius: {
      stages: affected.length,
      affected,
      label:
        affected.length >= 4
          ? "WIDE IMPACT"
          : affected.length >= 2
            ? "MULTI-STAGE"
            : affected.length
              ? "CONTAINED"
              : "NO IMPACT",
    },
    chain: chain.slice(0, 12),
    hypotheses,
    evidence: events
      .filter(
        (event) =>
          event.status !== "success" || Boolean(event.error) || Boolean(event.message),
      )
      .slice(0, 12)
      .map((event) => ({
        timestamp: event.timestamp,
        stage: event.stage,
        status: event.status,
        detail: stringValue(
          event.error || event.message || event.reason || event.detail || event.status,
        ),
      })),
    response: { contain, prevent },
    events,
  };
}

export function formatMarkdownReport(analysis: Analysis) {
  return [
    `# Incident Report — ${analysis.caseId}`,
    "",
    "Generated by **Kedhar // Pipeline Forensics**",
    "",
    "## Executive summary",
    "",
    `- **Run:** ${analysis.runId}`,
    `- **Severity:** ${analysis.severity.code} — ${analysis.severity.label}`,
    `- **Primary failure:** ${analysis.primaryFailure.stage}`,
    `- **Likely cause:** ${analysis.hypotheses[0]?.title || "No failure detected"}`,
    `- **Confidence:** ${analysis.confidence}%`,
    `- **Fingerprint:** \`${analysis.fingerprint}\``,
    "",
    "## Failure chain",
    "",
    analysis.chain
      .map((node) => `\`${node.stage}\` (${node.status}, ${node.latencyMs}ms)`)
      .join(" → "),
    "",
    "## Ranked hypotheses",
    "",
    ...analysis.hypotheses.flatMap((item, index) => [
      `### ${index + 1}. ${item.title} — ${item.score}%`,
      "",
      item.hypothesis,
      "",
      ...item.evidence.map((evidence) => `- ${evidence}`),
      "",
    ]),
    "## Immediate containment",
    "",
    ...(analysis.response.contain.length
      ? analysis.response.contain.map((item) => `- ${item}`)
      : ["- No emergency action required."]),
    "",
    "## Prevention",
    "",
    ...(analysis.response.prevent.length
      ? analysis.response.prevent.map((item) => `- ${item}`)
      : ["- Continue monitoring."]),
    "",
    "---",
    "Validate recommendations against your production environment before applying changes.",
  ].join("\n");
}
