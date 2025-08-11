import { useRef, useState } from "react";
import { createFormHook } from "@lib/create-form-hook";
import { cn } from "@/utils/cn";

// Create typed form hook
const { useForm } = createFormHook<{
  d: string;
  b: string;
  c: string;
  a: string;
  e: number;
}>();

type LogEntry = { id: string; text: string };

export function WatcherCascadesDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef<number>(0);

  const { Form, Field } = useForm({
    defaultValues: {
      d: "",
      b: "",
      c: "",
      a: "",
      e: 0,
    },
  });

  return (
    <Form className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Watcher Cascades</h2>
          <p className="mt-2 text-sm text-gray-600">
            Showcases legitimate cascades: a chain and a diamond. The library
            runs each watched→target edge at most once per action, so cascades
            complete but feedback loops don&apos;t runaway.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Field name="d">
            {(field) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLogs((prev) => [
                      ...prev,
                      {
                        id: String(logIdRef.current++),
                        text: `▶️ Trigger: set d = "foo"`,
                      },
                    ]);
                    field.handleChange("foo");
                  }}
                  className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
                >
                  Set d = "foo"
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLogs((prev) => [
                      ...prev,
                      { id: String(logIdRef.current++), text: "🔄 Reset" },
                    ]);
                    field.handleChange("");
                  }}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Reset
                </button>
              </div>
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* D: Source field */}
          <Field name="d">
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">D (source)</span>
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
                  placeholder="Type to trigger cascades..."
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>

          {/* B: watches D (chain start) */}
          <Field
            name="b"
            watchFields={{
              d: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                const next = watchedValue.trim().toUpperCase();
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `b watcher (${action}): b = upper(trim(d)) = "${next}"`,
                  },
                ]);
                formApi.setValue("b", next);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">B (watches D)</span>
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
                  placeholder="Auto from D"
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>

          {/* C: watches D (diamond) */}
          <Field
            name="c"
            watchFields={{
              d: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                const next = `${watchedValue}-c`;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `c watcher (${action}): c = d + "-c" = "${next}"`,
                  },
                ]);
                formApi.setValue("c", next);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">C (watches D)</span>
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
                  placeholder="Auto from D"
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>

          {/* A: watches both B and C (diamond converge) */}
          <Field
            name="a"
            watchFields={{
              b: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                const c = formApi.getField("c").value;
                const next = `${watchedValue}|${c}`;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `a watcher (${action}, from B): a = b|c = "${next}"`,
                  },
                ]);
                formApi.setValue("a", next);
              },
              c: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                const b = formApi.getField("b").value;
                const next = `${b}|${watchedValue}`;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `a watcher (${action}, from C): a = b|c = "${next}"`,
                  },
                ]);
                formApi.setValue("a", next);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">
                  A (watches B & C)
                </span>
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
                  placeholder="Auto from B & C"
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>

          {/* E: watches A (chain continuation) */}
          <Field
            name="e"
            watchFields={{
              a: ({ action, watchedValue, formApi }) => {
                if (action !== "change") {
                  return;
                }
                const next = watchedValue.length;
                setLogs((prev) => [
                  ...prev,
                  {
                    id: String(logIdRef.current++),
                    text: `e watcher (${action}): e = len(a) = ${next}`,
                  },
                ]);
                formApi.setValue("e", next);
              },
            }}
          >
            {(field) => (
              <label className="flex flex-col gap-2">
                <span className="px-2 text-sm font-medium">E (watches A)</span>
                <input
                  type="number"
                  value={field.value}
                  onChange={(e) => {
                    field.handleChange(Number(e.target.value));
                  }}
                  className={cn(
                    "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
                    field.validationState.type === "invalid" &&
                      "border-red-500",
                  )}
                  placeholder="Auto from A"
                />
                <div className="text-xs text-gray-500">
                  Changes: {field.meta.numberOfChanges}
                </div>
              </label>
            )}
          </Field>
        </div>

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
