import { derived, signal, useSignal } from "@lib/store/signals";
import { cn } from "@/utils/cn";
import { createContext, use } from "react";

const count = signal(0);

const doubled = derived(() => count.value * 2);
const parity = derived(() => (count.value % 2 === 0 ? "even" : "odd"));
const summary = derived(() => `count=${count.value}`);

const store = {
  count,
  doubled,
  parity,
  summary,
} as const;

type Store = typeof store;

const Context = createContext<Store>(store);

function Provider({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Context value={store}>{children}</Context>;
}

export function UseSignalDemo() {
  return (
    <Provider>
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h2 className="text-2xl font-bold">useSignal Demo</h2>
          <p className="mt-2 text-sm text-gray-600">
            Minimal reactive state using Signals with React subscription via
            <code className="ml-1 rounded bg-gray-100 px-1 py-0.5">
              useSignal
            </code>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card title="Controls">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  count.value = count.value + 1;
                }}
                className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                + Increment
              </button>
              <button
                type="button"
                onClick={() => {
                  count.value = count.value - 1;
                }}
                className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                − Decrement
              </button>
              <button
                type="button"
                onClick={() => {
                  count.value = 0;
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </Card>

          <Card title="Values">
            <KeyValue k="count" highlight />
            <KeyValue k="doubled" />
            <KeyValue k="parity" />
            <KeyValue k="summary" mono />
          </Card>
        </div>
      </div>
    </Provider>
  );
}

function Card({
  title,
  children,
}: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function KeyValue({
  k,
  mono,
  highlight,
}: Readonly<{
  k: keyof Store;
  mono?: boolean;
  highlight?: boolean;
}>) {
  const store = use(Context);

  const v = useSignal(store[k]);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-gray-500">{k}</span>
      <span
        className={cn(
          "rounded px-2 py-0.5",
          mono && "font-mono",
          highlight ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-800",
        )}
      >
        {v}
      </span>
    </div>
  );
}
