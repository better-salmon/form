import { useRef, useState } from "react";
import { createFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";
import type { Branded } from "@/types/types";

type A = Branded<string, "a">;
type B = Branded<string, "b">;

// Create typed form hook
const { useForm } = createFormHook<{
  a: A;
  b: B;
}>();

type LogEntry = { id: string; text: string };

export function WatcherLoopBugDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [maxSteps, setMaxSteps] = useState<number>(12);

  // Guards live in refs so watcher closures can read latest values
  const enabledRef = useRef(enabled);
  const remainingRef = useRef<number>(maxSteps);
  const logIdRef = useRef<number>(0);

  enabledRef.current = enabled;
  remainingRef.current = maxSteps;

  const { Form, Field } = useForm({
    defaultValues: {
      a: "" as A,
      b: "" as B,
    },
  });

  return (
    <Form className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Watcher Feedback Loop Bug</h2>
          <p className="mt-2 text-sm text-gray-600">
            This demo intentionally wires two watchers in a way that creates a
            feedback loop. It is guarded to stop after a limited number of steps
            to avoid freezing the page.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <input
              id="enable-loop"
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="enable-loop" className="text-sm font-medium">
              Enable loop
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="max-steps" className="text-sm font-medium">
              Step limit
            </label>
            <input
              id="max-steps"
              type="number"
              min={1}
              max={100}
              step={1}
              value={maxSteps}
              onChange={(e) => {
                const n = Number(e.target.value);
                setMaxSteps(
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
                // reset guard
                remainingRef.current = maxSteps;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `▶️ Start: set a = "start" (max ${maxSteps} steps)`,
                  },
                ]);
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Prime guard
            </button>
          </div>
        </div>

        {/* Field A: Mirrors B on change */}
        <Field
          name="a"
          watchFields={{
            b: ({ action, watchedValue, formApi }) => {
              if (action !== "change") {
                return;
              }
              if (!enabledRef.current) {
                return;
              }
              if (remainingRef.current <= 0) {
                return;
              }

              remainingRef.current -= 1;
              setLogs((prev) => [
                ...prev,
                {
                  id: String(logIdRef.current++),
                  text: `a watcher (${action}): set a = "${watchedValue}"`,
                },
              ]);
              const next = watchedValue as unknown as A;
              formApi.setValue("a", next);
            },
          }}
        >
          {(field) => (
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">Field A</span>
              <input
                type="text"
                value={field.value}
                onChange={(e) => {
                  field.handleChange(e.target.value as A);
                }}
                className={cn(
                  "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
                  field.validationState.type === "invalid" && "border-red-500",
                )}
                placeholder="Type to trigger loop..."
              />
              <div className="text-xs text-gray-500">
                Changes: {field.meta.numberOfChanges}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    remainingRef.current = maxSteps;
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: `▶️ Trigger: set a = "start" (max ${maxSteps} steps)`,
                      },
                    ]);
                    field.handleChange("start" as A);
                  }}
                  className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Start loop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: "⏹️ Stop (no-op guard)",
                      },
                    ]);
                    remainingRef.current = 0;
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: "🔄 Reset values",
                      },
                    ]);
                    field.handleChange("" as A);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Reset A
                </button>
              </div>
            </label>
          )}
        </Field>

        {/* Field B: Copies A + "-copy" on change */}
        <Field
          name="b"
          watchFields={{
            a: ({ action, watchedValue, formApi }) => {
              if (action !== "change") {
                return;
              }
              if (!enabledRef.current) {
                return;
              }
              if (remainingRef.current <= 0) {
                return;
              }

              remainingRef.current -= 1;
              const next = `${String(watchedValue)}-copy` as B;
              setLogs((prev) => [
                ...prev,
                {
                  id: String(logIdRef.current++),
                  text: `b watcher (${action}): set b = "${String(next)}"`,
                },
              ]);
              formApi.setValue("b", next);
            },
          }}
        >
          {(field) => (
            <label className="flex flex-col gap-2">
              <span className="px-2 text-sm font-medium">Field B</span>
              <input
                type="text"
                value={field.value}
                onChange={(e) => {
                  field.handleChange(e.target.value as B);
                }}
                className={cn(
                  "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
                  field.validationState.type === "invalid" && "border-red-500",
                )}
                placeholder="This will be auto-set by watchers"
              />
              <div className="text-xs text-gray-500">
                Changes: {field.meta.numberOfChanges}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    remainingRef.current = maxSteps;
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: `▶️ Trigger: set b = "start" (max ${maxSteps} steps)`,
                      },
                    ]);
                    field.handleChange("start" as B);
                  }}
                  className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Start loop (from B)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: "🔄 Reset values",
                      },
                    ]);
                    field.handleChange("" as B);
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Reset B
                </button>
              </div>
            </label>
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
