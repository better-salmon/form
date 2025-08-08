import "@/index.css";
import { useEffect, useState } from "react";
import { WatcherDemo } from "@/demos/watcher-demo";
import { WatcherLoopBugDemo } from "@/demos/watcher-loop-bug-demo";
import { WatcherCascadesDemo } from "@/demos/watcher-cascades-demo";
import { PasswordDemo } from "@/demos/password-demo";
import { ContactDemo } from "@/demos/contact-demo";
import { cn } from "@/utils/cn";

const DEMOS = [
  {
    id: "contact",
    name: "Contact Demo",
    component: ContactDemo,
    description: "Simple name, email, and phone form",
  },
  {
    id: "watcher",
    name: "Watcher Demo",
    component: WatcherDemo,
    description: "Field dependencies and watchers",
  },
  {
    id: "watcher-loop-bug",
    name: "Watcher Loop Bug",
    component: WatcherLoopBugDemo,
    description: "Intentional feedback loop with guards and logging",
  },
  {
    id: "watcher-cascades",
    name: "Watcher Cascades",
    component: WatcherCascadesDemo,
    description: "Legit cascades: chain and diamond propagation",
  },
  {
    id: "password",
    name: "Password Demo",
    component: PasswordDemo,
    description: "Password validation and confirmation",
  },
] as const;

type DemoNames = (typeof DEMOS)[number]["id"];
type SidebarState = "show" | "collapsed";

// Helper functions for URL state management
function getUrlParams() {
  const params = new URLSearchParams(globalThis.location.search);
  return {
    demo: (params.get("demo") ?? "contact") as DemoNames,
    sidebar: (params.get("sidebar") ?? "show") as SidebarState,
  };
}

function updateUrlParams(demo: DemoNames, sidebarCollapsed: SidebarState) {
  const searchParams = new URLSearchParams();

  if (demo !== "contact") {
    searchParams.set("demo", demo);
  }

  if (sidebarCollapsed === "collapsed") {
    searchParams.set("sidebar", "collapsed");
  }

  const url = new URL(globalThis.location.href);

  url.search = searchParams.toString();

  globalThis.history.replaceState({}, "", url);
}

function App() {
  const urlParams = getUrlParams();
  const [activeDemo, setActiveDemo] = useState<DemoNames>(urlParams.demo);
  const [sidebarState, setSidebarCollapsed] = useState<SidebarState>(
    urlParams.sidebar,
  );

  const sidebarCollapsed = sidebarState === "collapsed";

  useEffect(() => {
    updateUrlParams(activeDemo, sidebarState);
  }, [activeDemo, sidebarState]);

  const ActiveComponent =
    DEMOS.find((demo) => demo.id === activeDemo)?.component ?? ContactDemo;

  const activeDemoInfo = DEMOS.find((demo) => demo.id === activeDemo);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div
        className={cn(
          "flex flex-col border-r border-gray-200 bg-white transition-all duration-200",
          sidebarCollapsed ? "w-16" : "w-72",
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 p-4">
          {!sidebarCollapsed && (
            <h1 className="text-sm font-medium text-gray-900">Form Demos</h1>
          )}
          <button
            type="button"
            onClick={() => {
              setSidebarCollapsed((prev) =>
                prev === "collapsed" ? "show" : "collapsed",
              );
            }}
            className="cursor-pointer rounded-md bg-gray-100 p-2 text-gray-500 hover:text-gray-700"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className="text-lg">{sidebarCollapsed ? "→" : "←"}</span>
          </button>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 p-2", !sidebarCollapsed && "p-4")}>
          <div className="space-y-2">
            {DEMOS.map((demo, index) => (
              <button
                type="button"
                key={demo.id}
                onClick={() => {
                  setActiveDemo(demo.id);
                }}
                className={cn(
                  "w-full rounded-md transition-colors",
                  sidebarCollapsed ? "px-2 py-2" : "px-3 py-2 text-left",
                  activeDemo === demo.id
                    ? "bg-blue-500 text-white"
                    : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                )}
                title={sidebarCollapsed ? demo.name : undefined}
              >
                {sidebarCollapsed ? (
                  <div className="flex justify-center">
                    <span className="text-xs font-medium">{index + 1}</span>
                  </div>
                ) : (
                  <div>
                    <div className="text-sm font-medium">{demo.name}</div>
                    <div
                      className={cn(
                        "mt-1 text-xs",
                        activeDemo === demo.id
                          ? "text-blue-100"
                          : "text-gray-500",
                      )}
                    >
                      {demo.description}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Main Content */}
      <div
        className="flex min-w-0 flex-1 flex-col"
        style={{ minWidth: "400px" }}
      >
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {activeDemoInfo?.name}
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              {activeDemoInfo?.description}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-6 lg:p-8">
            <div className="mx-auto max-w-4xl">
              <ActiveComponent />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
