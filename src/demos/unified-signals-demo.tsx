import {
  createSignalFormHook,
  type FieldState,
} from "@lib/create-form-hook";
import type React from "react";
import type { StandardSchemaV1 } from "@standard-schema/spec";

// Minimal Standard Schema for email validation (demo-only)
const emailSchema = {
  "~standard": {
    version: 1,
    vendor: "demo",
    validate(input: unknown) {
      const s = typeof input === "string" ? input.trim() : "";
      const at = s.indexOf("@");
      const dot = s.lastIndexOf(".");
      const ok =
        at > 0 && dot > at + 1 && dot < s.length - 1 && !s.includes(" ");
      return ok ? { value: s } : { issues: [{ message: "Invalid email" }] };
    },
  },
} as unknown as StandardSchemaV1<string>;

function normalizePhone(raw: string): string {
  const digits = raw.replaceAll(/\D+/g, "");
  if (digits.length <= 10) {
    return digits;
  }
  return `+${digits}`;
}

const api = {
  async checkEmailAvailable(email: string, opts?: { signal?: AbortSignal }) {
    // Simulate remote call + abort support using fake server
    await fetch(`http://localhost:3001/ok?delay=1000&value=${email}`, {
      signal: opts?.signal,
    });
    return email.toLowerCase() !== "taken@example.com";
  },
  async fetchStates(country: string, opts?: { signal?: AbortSignal }) {
    await fetch(`http://localhost:3001/ok?delay=1000&value=${country}`, {
      signal: opts?.signal,
    });
    if (!country) {
      return [] as string[];
    }
    if (country === "US") {
      return ["CA", "NY", "TX", "WA"];
    }
    if (country === "CA") {
      return ["BC", "ON", "QC", "AB"];
    }
    return ["N/A"];
  },
};

type Form = {
  age: number;
  email: string;
  country: string;
  city: string;
  password: string;
  confirm: string;
  phone: string;
  state: string;
  stateOptions: string[];
  firstName: string;
  lastName: string;
  fullName: string;
};

const { useSignalForm, useSignalField } = createSignalFormHook<Form>();

const renderState = (state: FieldState) => {
  switch (state.type) {
    case "invalid": {
      return <span className="text-red-600">{state.issues[0]?.message}</span>;
    }
    case "warning": {
      return <span className="text-amber-600">{state.issues[0]?.message}</span>;
    }
    case "idle": {
      return <span className="text-gray-400">idle</span>;
    }
    case "waiting": {
      return <span className="text-blue-400">waiting…</span>;
    }
    case "checking": {
      return <span className="text-blue-600">checking…</span>;
    }
    default: {
      return null;
    }
  }
};

export function UnifiedSignalsDemo() {
  const { Form: FormRoot } = useSignalForm({
    defaultValues: {
      age: 0,
      email: "",
      country: "US",
      city: "",
      password: "",
      confirm: "",
      phone: "",
      state: "",
      stateOptions: [],
      firstName: "",
      lastName: "",
      fullName: "",
    },
  });

  return (
    <FormRoot className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-6 p-6">
        <h2 className="text-2xl font-bold">Unified Signals Demo</h2>
        <p className="text-sm text-gray-600">
          One handler per field: listeners, normalization, sync validation,
          async behavior.
        </p>

        {/* Age */}
        <SignalFieldAge renderState={renderState} />

        {/* Email */}
        <SignalFieldEmail renderState={renderState} />

        {/* Country / City */}
        <CountryField />
        <CityField />

        {/* Password */}
        <PasswordField />
        <ConfirmField renderState={renderState} />

        {/* Phone */}
        <SignalFieldPhone renderState={renderState} />

        {/* Country -> State hydration */}
        <SignalFieldState />

        {/* Derived fullName */}
        <FirstNameField />
        <LastNameField />
        <FullNameField />

        {/* Submit */}
        <div className="pt-4">
          <button
            type="submit"
            className="w-full rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 focus:outline-none"
          >
            Submit
          </button>
        </div>
      </div>
    </FormRoot>
  );
}

function SignalFieldAge({
  renderState,
}: {
  readonly renderState: (s: FieldState) => React.ReactNode;
}) {
  const field = useSignalField({
    name: "age",
    respond: ({ value, helpers }) =>
      value >= 18
        ? helpers.validation.valid()
        : helpers.validation.invalid({ issues: [{ message: "18+" }] }),
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Age</span>
        <input
          type="number"
          value={field.value}
          onChange={(e) => {
            field.handleChange(Number(e.target.value) || 0);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
      <div className="min-h-5 text-sm">
        {renderState(field.validationState)}
      </div>
    </fieldset>
  );
}

function SignalFieldEmail({
  renderState,
}: {
  readonly renderState: (s: FieldState) => React.ReactNode;
}) {
  const field = useSignalField({
    name: "email",
    standardSchema: emailSchema,
    debounceMs: 1000,
    respond: ({ action, helpers }) => {
      const issues = helpers.validateWithStandardSchema();
      console.log("action", action);
      if (issues?.length) {
        return helpers.validation.invalid({ issues });
      }
      if (action === "submit") {
        return helpers.validation.async.force(0);
      }
      if (action === "blur") {
        return helpers.validation.async.force(150);
      }
      return helpers.validation.async.auto();
    },
    respondAsync: async ({ value, helpers, signal }) => {
      const ok = await api.checkEmailAvailable(value, {
        signal,
      });
      return ok
        ? helpers.validation.valid()
        : helpers.validation.invalid({ issues: [{ message: "Taken" }] });
    },
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Email</span>
        <input
          type="email"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
          placeholder="name@example.com"
        />
      </label>
      <div className="min-h-5 text-sm">
        {renderState(field.validationState)}
      </div>
    </fieldset>
  );
}

function SignalFieldPhone({
  renderState,
}: {
  readonly renderState: (s: FieldState) => React.ReactNode;
}) {
  const field = useSignalField({
    name: "phone",
    respond: ({ value, form, helpers }) => {
      const n = normalizePhone(value);
      if (n !== value) {
        form.setValue("phone", n);
      }
      return n.length >= 10
        ? helpers.validation.valid()
        : helpers.validation.invalid({
            issues: [{ message: "Invalid phone" }],
          });
    },
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Phone</span>
        <input
          type="tel"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
      <div className="min-h-5 text-sm">
        {renderState(field.validationState)}
      </div>
    </fieldset>
  );
}

function SignalFieldState() {
  const state = useSignalField({
    name: "state",
    on: { from: { country: ["change"] } },
    respond: ({ helpers }) => helpers.validation.async.force(0),
    respondAsync: async ({ form, helpers, signal }) => {
      const c = form.getField("country").value;
      const options = await api.fetchStates(c, { signal });
      form.setValue("stateOptions", options);
      const current = form.getField("state").value;
      if (current && !options.includes(current)) {
        form.setValue("state", "");
      }
      return helpers.validation.valid({ details: { hydrated: true } });
    },
  });
  const stateOptions = useSignalField({
    name: "stateOptions",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <fieldset className="grid grid-cols-2 gap-4">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">State/Province</span>
        <select
          value={state.value}
          onChange={(e) => {
            state.handleChange(e.target.value);
          }}
          onBlur={state.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        >
          <option value="">—</option>
          {stateOptions.value.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

function CountryField() {
  const field = useSignalField({
    name: "country",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Country</span>
        <select
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        >
          <option value="US">US</option>
          <option value="CA">Canada</option>
          <option value="">Other</option>
        </select>
      </label>
    </fieldset>
  );
}

function CityField() {
  const field = useSignalField({
    name: "city",
    on: { from: { country: ["change"] } },
    respond: ({ cause, form }) => {
      if (!cause.isSelf && cause.field === "country") {
        form.setValue("city", "");
      }
    },
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">City</span>
        <input
          type="text"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
    </fieldset>
  );
}

function PasswordField() {
  const field = useSignalField({
    name: "password",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Password</span>
        <input
          type="password"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
    </fieldset>
  );
}

function ConfirmField({
  renderState,
}: {
  readonly renderState: (s: FieldState) => React.ReactNode;
}) {
  const field = useSignalField({
    name: "confirm",
    on: { from: { password: true } },
    respond: ({ form, value, helpers }) => {
      const pwd = form.getField("password").value;
      return value === pwd
        ? helpers.validation.valid()
        : helpers.validation.invalid({
            issues: [{ message: "Does not match" }],
          });
    },
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Confirm</span>
        <input
          type="password"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
      <div className="min-h-5 text-sm">
        {renderState(field.validationState)}
      </div>
    </fieldset>
  );
}

function FirstNameField() {
  const field = useSignalField({
    name: "firstName",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">First name</span>
        <input
          type="text"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
    </fieldset>
  );
}

function LastNameField() {
  const field = useSignalField({
    name: "lastName",
    respond: ({ helpers }) => helpers.validation.valid(),
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Last name</span>
        <input
          type="text"
          value={field.value}
          onChange={(e) => {
            field.handleChange(e.target.value);
          }}
          onBlur={field.handleBlur}
          className="w-full rounded-md border-2 border-gray-300 p-2"
        />
      </label>
    </fieldset>
  );
}

function FullNameField() {
  const field = useSignalField({
    name: "fullName",
    on: { from: { firstName: true, lastName: true } },
    respond: ({ form, helpers }) => {
      const f = form.getField("firstName").value;
      const l = form.getField("lastName").value;
      form.setValue("fullName", `${f} ${l}`.trim());
      return helpers.validation.valid();
    },
  });
  return (
    <fieldset className="space-y-1">
      <label className="flex flex-col gap-2">
        <span className="px-2 text-sm font-medium">Full name (derived)</span>
        <input
          type="text"
          value={field.value}
          readOnly
          className="w-full rounded-md border-2 border-gray-300 bg-gray-100 p-2"
        />
      </label>
    </fieldset>
  );
}

// removed unused combined variant
