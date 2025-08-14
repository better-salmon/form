import { useRef, useState } from "react";
import { createSignalFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";
import type { Branded } from "@/types/types";

type A = Branded<string, "a">;
type B = Branded<string, "b">;

type Form = {
  a: A;
  b: B;
};

type LogEntry = { id: string; text: string };

const { useSignalForm, useSignalField } = createSignalFormHook<Form>();

export function SignalsWatcherLoopBugDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [enabled, setEnabled] = useState<boolean>(false);
  const [maxSteps, setMaxSteps] = useState<number>(12);

  const enabledRef = useRef(enabled);
  const remainingRef = useRef<number>(maxSteps);
  const logIdRef = useRef<number>(0);

  enabledRef.current = enabled;
  remainingRef.current = Math.max(1, Math.min(100, maxSteps));

  const { Form: FormRoot } = useSignalForm({
    defaultValues: { a: "" as A, b: "" as B },
  });

  const pushLog = (text: string) => {
    setLogs((prev) => [...prev, { id: String(logIdRef.current++), text }]);
  };
  const isEnabled = () => enabledRef.current;
  const consumeStep = () => {
    if (remainingRef.current <= 0) {
      return false;
    }
    remainingRef.current -= 1;
    return true;
  };
  const resetSteps = () => {
    remainingRef.current = maxSteps;
  };
  const stop = () => {
    remainingRef.current = 0;
  };

  return (
    <FormRoot className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">
            Watcher Feedback Loop Bug (Signals)
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            This demo wires two watchers to create a feedback loop. Guards stop
            after a limited number of steps.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <input
              id="enable-loop-s"
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="enable-loop-s" className="text-sm font-medium">
              Enable loop
            </label>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="max-steps-s" className="text-sm font-medium">
              Step limit
            </label>
            <input
              id="max-steps-s"
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

        <FieldA
          isEnabled={isEnabled}
          consumeStep={consumeStep}
          resetSteps={resetSteps}
          stop={stop}
          pushLog={pushLog}
          maxSteps={maxSteps}
        />

        <FieldB
          isEnabled={isEnabled}
          consumeStep={consumeStep}
          resetSteps={resetSteps}
          pushLog={pushLog}
          maxSteps={maxSteps}
        />

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
    </FormRoot>
  );
}

function FieldA({
  isEnabled,
  consumeStep,
  resetSteps,
  stop,
  pushLog,
  maxSteps,
}: Readonly<{
  isEnabled: () => boolean;
  consumeStep: () => boolean;
  resetSteps: () => void;
  stop: () => void;
  pushLog: (text: string) => void;
  maxSteps: number;
}>) {
  const field = useSignalField({
    name: "a",
    on: { from: { b: ["change"] } },
    respond: ({ action, cause, helpers, form }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (!isEnabled()) {
        return helpers.validation.valid();
      }
      if (!consumeStep()) {
        return helpers.validation.valid();
      }
      const next = form.getField("b").value as unknown as A;
      pushLog(`a watcher (${action}): set a = "${String(next)}"`);
      form.setValue("a", next);
      return helpers.validation.valid();
    },
  });
  return (
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
            resetSteps();
            pushLog(`▶️ Trigger: set a = "start" (max ${maxSteps} steps)`);
            field.handleChange("start" as A);
          }}
          className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Start loop
        </button>
        <button
          type="button"
          onClick={() => {
            pushLog("⏹️ Stop (no-op guard)");
            stop();
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={() => {
            pushLog("🔄 Reset values");
            field.handleChange("" as A);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Reset A
        </button>
      </div>
    </label>
  );
}

function FieldB({
  isEnabled,
  consumeStep,
  resetSteps,
  pushLog,
  maxSteps,
}: Readonly<{
  isEnabled: () => boolean;
  consumeStep: () => boolean;
  resetSteps: () => void;
  pushLog: (text: string) => void;
  maxSteps: number;
}>) {
  const field = useSignalField({
    name: "b",
    on: { from: { a: ["change"] } },
    respond: ({ action, cause, helpers, form }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (!isEnabled()) {
        return helpers.validation.valid();
      }
      if (!consumeStep()) {
        return helpers.validation.valid();
      }
      const next = `${String(form.getField("a").value)}-copy` as B;
      pushLog(`b watcher (${action}): set b = "${String(next)}"`);
      form.setValue("b", next);
      return helpers.validation.valid();
    },
  });
  return (
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
            resetSteps();
            pushLog(`▶️ Trigger: set b = "start" (max ${maxSteps} steps)`);
            field.handleChange("start" as B);
          }}
          className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          Start loop (from B)
        </button>
        <button
          type="button"
          onClick={() => {
            pushLog("🔄 Reset values");
            field.handleChange("" as B);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Reset B
        </button>
      </div>
    </label>
  );
}
