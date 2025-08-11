import { useRef, useState } from "react";
import { createFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";

type Status = "idle" | "loading" | "success" | "stale";

type AsyncWatcherForm = {
  query: string;
  result: string;
  status: Status;
};

const { useForm } = createFormHook<AsyncWatcherForm>();

type LogEntry = { id: string; text: string };

export function WatcherAsyncDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef<number>(0);

  // Monotonic run id to cancel/discard stale async work across ticks
  const runIdRef = useRef<number>(0);
  const reverseRunIdRef = useRef<number>(0);

  // Optional feedback loop controls
  const [loopEnabled, setLoopEnabled] = useState<boolean>(false);
  const [loopMaxSteps, setLoopMaxSteps] = useState<number>(12);
  const loopEnabledRef = useRef<boolean>(loopEnabled);
  const loopRemainingRef = useRef<number>(loopMaxSteps);
  loopEnabledRef.current = loopEnabled;
  loopRemainingRef.current = Math.max(
    1,
    Math.min(1000, loopRemainingRef.current),
  );

  const { Form, Field } = useForm({
    defaultValues: {
      query: "",
      result: "",
      status: "idle",
    },
  });

  return (
    <Form className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Watcher Schedules Async Work</h2>
          <p className="mt-2 text-sm text-gray-600">
            Changing the query starts an async job (setTimeout) that updates
            result later. New changes cancel older runs via a run id guard.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <input
              id="enable-loop"
              type="checkbox"
              checked={loopEnabled}
              onChange={(e) => {
                setLoopEnabled(e.target.checked);
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="enable-loop" className="text-sm font-medium">
              Enable async loop (result → query)
            </label>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="loop-steps" className="text-sm font-medium">
              Step limit
            </label>
            <input
              id="loop-steps"
              type="number"
              min={1}
              max={100}
              step={1}
              value={loopMaxSteps}
              onChange={(e) => {
                const n = Number(e.target.value);
                setLoopMaxSteps(
                  Number.isFinite(n) ? Math.max(1, Math.min(100, n)) : 12,
                );
              }}
              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                // Reset guard and kick a cycle from query side
                loopRemainingRef.current = loopMaxSteps;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `▶️ Start loop from query (max ${loopMaxSteps} steps)`,
                  },
                ]);
              }}
              className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              Prime loop
            </button>
            <button
              type="button"
              onClick={() => {
                // Invalidate any pending jobs from both directions
                runIdRef.current += 1;
                reverseRunIdRef.current += 1;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: "⏹️ Cancel pending async run(s)",
                  },
                ]);
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel pending
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Query field (source) */}
          <Field
            name="query"
            watchFields={{
              // Reverse watcher: when result changes, schedule async update to query
              result: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                if (!loopEnabledRef.current) {
                  return;
                }
                if (loopRemainingRef.current <= 0) {
                  return;
                }

                loopRemainingRef.current -= 1;
                const revRunId = ++reverseRunIdRef.current;
                const delayMs = 500;

                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `↩️ rev#${revRunId}: schedule query from result = "${watchedValue}"`,
                  },
                ]);

                const source = watchedValue;
                setTimeout(() => {
                  if (revRunId !== reverseRunIdRef.current) {
                    setLogs((prev) => {
                      return [
                        ...prev,
                        {
                          id: String(logIdRef.current++),
                          text: `⚠️ rev#${revRunId}: stale (discarded)`,
                        },
                      ];
                    });
                    return;
                  }

                  const nextQuery = `${source.toLowerCase()}!`;
                  formApi.setValue("query", nextQuery);
                  setLogs((prev) => [
                    ...prev,
                    {
                      id: String(logIdRef.current++),
                      text: `🔁 rev#${revRunId}: set query = "${nextQuery}"`,
                    },
                  ]);
                }, delayMs);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">Query</span>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
                    field.validationState.type === "invalid" &&
                      "border-red-500",
                  )}
                  placeholder="Type to trigger async work..."
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>

          {/* Result field watches Query and schedules async work */}
          <Field
            name="result"
            watchFields={{
              query: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }

                // Start a new run and cancel any stale ones
                const runId = ++runIdRef.current;

                formApi.setValue("status", "loading");
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `🕒 run#${runId}: schedule async compute for query = "${watchedValue}"`,
                  },
                ]);

                const current = watchedValue;
                const delayMs = 800;

                setTimeout(() => {
                  if (runId !== runIdRef.current) {
                    // This run is stale; ignore
                    formApi.setValue("status", "stale");
                    setLogs((prev) => {
                      return [
                        ...prev,
                        {
                          id: String(logIdRef.current++),
                          text: `⚠️ run#${runId}: stale (discarded)`,
                        },
                      ];
                    });
                    return;
                  }

                  const computed = current.trim().toUpperCase();
                  formApi.setValue("result", computed);
                  formApi.setValue("status", "success");
                  setLogs((prev) => [
                    ...prev,
                    {
                      id: String(logIdRef.current++),
                      text: `✅ run#${runId}: fulfilled → result = "${computed}"`,
                    },
                  ]);
                }, delayMs);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">Result (async)</span>
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
                    field.validationState.type === "invalid" &&
                      "border-red-500",
                  )}
                  placeholder="Auto from async watcher"
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>
        </div>

        {/* Status */}
        <Field name="status">
          {(field) => (
            <div className="rounded border border-gray-200 bg-white p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <span
                  className={cn(
                    "rounded px-2 py-0.5",
                    field.value === "idle" && "bg-gray-100 text-gray-700",
                    field.value === "loading" &&
                      "bg-yellow-100 text-yellow-800",
                    field.value === "success" && "bg-green-100 text-green-800",
                    field.value === "stale" && "bg-orange-100 text-orange-800",
                  )}
                >
                  {field.value}
                </span>
                <div className="ml-auto text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </div>
            </div>
          )}
        </Field>

        {/* Log */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Event log</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLogs([]);
                }}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium hover:bg-gray-50"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
            {logs.length === 0 ? (
              <div className="text-gray-500">No events yet.</div>
            ) : (
              <ol className="space-y-1">
                {logs.slice(-200).map((entry) => (
                  <li key={entry.id} className="font-mono">
                    {entry.text}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </Form>
  );
}
