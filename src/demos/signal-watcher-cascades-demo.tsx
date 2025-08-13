import { useRef, useState } from "react";
//
import { createSignalFormHook } from "@lib/create-form-hook-signals";
import { cn } from "@/utils/cn";

type LogEntry = { id: string; text: string };

type Form = {
  d: string;
  b: string;
  c: string;
  a: string;
  e: number;
};

const { useSignalForm, useSignalField } = createSignalFormHook<Form>();

export function SignalsWatcherCascadesDemo() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef<number>(0);

  const { Form: FormRoot } = useSignalForm({
    defaultValues: { d: "", b: "", c: "", a: "", e: 0 },
  });

  const pushLog = (text: string) => {
    setLogs((prev) => [...prev, { id: String(logIdRef.current++), text }]);
  };

  return (
    <FormRoot className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Watcher Cascades (Signals)</h2>
          <p className="mt-2 text-sm text-gray-600">
            Showcases legitimate cascades: a chain and a diamond. The library
            runs each watched→target edge at most once per action, so cascades
            complete but feedback loops don&apos;t runaway.
          </p>
        </div>

        <DField pushLog={pushLog} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <BField pushLog={pushLog} />
          <CField pushLog={pushLog} />
          <AField pushLog={pushLog} />
          <EField pushLog={pushLog} />
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
    </FormRoot>
  );
}

function DField({
  pushLog,
}: Readonly<{
  pushLog: (text: string) => void;
}>) {
  const field = useSignalField({
    name: "d",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              pushLog(`▶️ Trigger: set d = "foo"`);
              field.handleChange("foo");
            }}
            className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
          >
            Set d = "foo"
          </button>
          <button
            type="button"
            onClick={() => {
              pushLog("🔄 Reset");
              field.handleChange("");
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </div>

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
            field.validationState.type === "invalid" && "border-red-500",
          )}
          placeholder="Type to trigger cascades..."
        />
        <div className="text-xs text-gray-500">
          Changes: {field.meta.numberOfChanges}
        </div>
      </label>
    </div>
  );
}

function BField({
  pushLog,
}: Readonly<{
  pushLog: (text: string) => void;
}>) {
  const field = useSignalField({
    name: "b",
    on: { from: { d: ["change"] } },
    respond: ({ action, cause, form, helpers, value }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (cause.field !== "d") {
        return;
      }
      const d = form.getField("d").value;
      const next = d.trim().toUpperCase();
      if (next !== value) {
        pushLog(`b watcher (${action}): b = upper(trim(d)) = "${next}"`);
        form.setValue("b", next);
      }
      return helpers.validation.valid();
    },
  });
  return (
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
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Auto from D"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}

function CField({
  pushLog,
}: Readonly<{
  pushLog: (text: string) => void;
}>) {
  const field = useSignalField({
    name: "c",
    on: { from: { d: ["change"] } },
    respond: ({ action, cause, form, helpers, value }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (cause.field !== "d") {
        return;
      }
      const dv = form.getField("d").value;
      const next = `${dv}-c`;
      if (next !== value) {
        pushLog(`c watcher (${action}): c = d + "-c" = "${next}"`);
        form.setValue("c", next);
      }
      return helpers.validation.valid();
    },
  });
  return (
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
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Auto from D"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}

function AField({
  pushLog,
}: Readonly<{
  pushLog: (text: string) => void;
}>) {
  const field = useSignalField({
    name: "a",
    on: { from: { b: ["change"], c: ["change"] } },
    respond: ({ action, cause, form, helpers, value }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (cause.field !== "b" && cause.field !== "c") {
        return;
      }
      const b = form.getField("b").value;
      const c = form.getField("c").value;
      const next = `${b}|${c}`;
      if (next !== value) {
        pushLog(
          cause.field === "b"
            ? `a watcher (${action}, from B): a = b|c = "${next}"`
            : `a watcher (${action}, from C): a = b|c = "${next}"`,
        );
        form.setValue("a", next);
      }
      return helpers.validation.valid();
    },
  });
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">A (watches B & C)</span>
      <input
        type="text"
        value={field.value}
        onChange={(e) => {
          field.handleChange(e.target.value);
        }}
        className={cn(
          "w-full rounded-md border-2 border-gray-300 p-2 outline-none",
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Auto from B & C"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}

function EField({
  pushLog,
}: Readonly<{
  pushLog: (text: string) => void;
}>) {
  const field = useSignalField({
    name: "e",
    on: { from: { a: ["change"] } },
    respond: ({ action, cause, form, helpers, value }) => {
      if (action !== "change") {
        return;
      }
      if (cause.isSelf) {
        return;
      }
      if (cause.field !== "a") {
        return;
      }
      const next = form.getField("a").value.length;
      if (next !== value) {
        pushLog(`e watcher (${action}): e = len(a) = ${next}`);
        form.setValue("e", next);
      }
      return helpers.validation.valid();
    },
  });
  return (
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
          field.validationState.type === "invalid" && "border-red-500",
        )}
        placeholder="Auto from A"
      />
      <div className="text-xs text-gray-500">
        Changes: {field.meta.numberOfChanges}
      </div>
    </label>
  );
}
