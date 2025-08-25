import { createForm } from "al-formo";
import { useState } from "react";
import { cn } from "@/utils/cn";
import { z } from "zod";

const EmailSchema = z.email("Invalid email");

type Country = "" | "USA" | "Canada";
type CityNonEmpty = "Chicago" | "New-York" | "Québec" | "Montréal";
type City = "" | CityNonEmpty;

type WizardForm = {
  name: string;
  email: string;
  country: Country;
  city: {
    allowedCities: readonly CityNonEmpty[];
    city: City;
  };
};

const COUNTRIES = ["USA", "Canada"] as const;
type CountryNonEmpty = (typeof COUNTRIES)[number];

const CITY_OPTIONS: Record<CountryNonEmpty, readonly CityNonEmpty[]> = {
  USA: ["Chicago", "New-York"],
  Canada: ["Québec", "Montréal"],
};

function isCountryNonEmpty(value: string): value is CountryNonEmpty {
  return value === "USA" || value === "Canada";
}

type Step = 1 | 2 | 3;

const {
  useForm,
  useField,
  defineField,
  useFormSelector,
  defineSelector,
  defineForm,
} = createForm<WizardForm>();

const wizardFormOptions = defineForm({
  defaultValues: {
    name: "",
    email: "",
    country: "",
    city: { allowedCities: [], city: "" },
  },
});

const nameOptions = defineField({
  name: "name",
  respond: (context) => {
    if (context.action === "change") {
      return context.helpers.validation.idle();
    }

    if (context.value.trim().length === 0) {
      return context.helpers.validation.idle();
    }
    if (context.value.trim().length < 2) {
      return context.helpers.validation.invalid({
        issues: [{ message: "Name must be at least 2 characters" }],
      });
    }
    return context.helpers.validation.valid();
  },
});

const emailOptions = defineField({
  name: "email",
  standardSchema: EmailSchema,
  respond: (context) => {
    if (context.value.trim().length === 0) {
      return context.helpers.validation.idle();
    }

    const issues = context.helpers.validateWithSchema();

    if (issues) {
      if (context.action === "change") {
        return context.helpers.validation.idle();
      }

      return context.helpers.validation.invalid({ issues });
    }

    return context.helpers.validation.valid();
  },
});

const countryOptions = defineField({
  name: "country",
  respond: (context) => {
    if (context.value === "") {
      context.form.setValue("city", {
        allowedCities: [],
        city: "",
      });
      return context.helpers.validation.idle();
    }
    if (isCountryNonEmpty(context.value)) {
      context.form.setValue("city", {
        allowedCities: CITY_OPTIONS[context.value],
        city: context.form.getSnapshot("city").value.city,
      });
      return context.helpers.validation.valid();
    }
    return context.helpers.validation.invalid({
      issues: [{ message: "Select USA or Canada" }],
    });
  },
});

const cityOptions = defineField({
  name: "city",
  watch: { fields: { country: ["change"] } },
  respond: (context) => {
    const country = context.form.getSnapshot("country").value;

    if (context.value.city === "") {
      return context.helpers.validation.idle();
    }

    const allowedCities: readonly CityNonEmpty[] =
      country === "" ? [] : CITY_OPTIONS[country];
    if (allowedCities.includes(context.value.city)) {
      return context.helpers.validation.valid();
    }
    return context.helpers.validation.invalid({
      issues: [{ message: "Select a city from the selected country" }],
    });
  },
});

const isCurrentStepValid = defineSelector((s, props?: { step: Step }) => {
  const currentStep: Step = props?.step ?? 1;
  if (currentStep === 1) {
    return (
      s.validation("name").type === "valid" &&
      s.validation("email").type === "valid"
    );
  }
  if (currentStep === 2) {
    return (
      s.validation("country").type === "valid" &&
      s.validation("city").type === "valid"
    );
  }
  return true; // Review step
});

const isAllValid = defineSelector((s) => {
  return (
    s.validation("name").type === "valid" &&
    s.validation("email").type === "valid" &&
    s.validation("country").type === "valid" &&
    s.validation("city").type === "valid"
  );
});

const reviewSnapshotSelector = defineSelector((s) => ({
  name: s.snapshot("name").value,
  email: s.snapshot("email").value,
  country: s.snapshot("country").value,
  city: s.snapshot("city").value.city,
}));

export default function WizardFunnelDemo() {
  const { Form } = useForm(wizardFormOptions);

  const [step, setStep] = useState<Step>(1);

  return (
    <Form
      className="mx-auto max-w-2xl space-y-6"
      onSubmit={(e) => {
        setStep((s) => Math.min(s + 1, 3) as Step);
        e.preventDefault();
      }}
    >
      <div className="space-y-4 p-6">
        <div className="mb-2">
          <h2 className="text-2xl font-bold">Wizard Funnel</h2>
          <p className="mt-1 text-sm text-gray-600">
            Multi-step form with step-gated validation
          </p>
        </div>

        <Stepper step={step} />

        {step === 1 && (
          <section className="space-y-4">
            <NameField />
            <EmailField />
          </section>
        )}

        {step === 2 && (
          <section className="space-y-4">
            <CountryField />
            <CityField />
          </section>
        )}

        {step === 3 && <ReviewSection />}

        <div className="flex items-center justify-between pt-4">
          <button
            type="button"
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => {
              setStep((s) => Math.max(s - 1, 1) as Step);
            }}
            disabled={step === 1}
          >
            Back
          </button>

          {step < 3 ? <NextButton step={step} /> : <SubmitButton />}
        </div>
      </div>
    </Form>
  );
}

function Stepper({ step }: Readonly<{ step: 1 | 2 | 3 }>) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
      {[1, 2, 3].map((n) => (
        <li key={n} className="flex items-center gap-2">
          <span
            className={
              "flex h-6 w-6 items-center justify-center rounded-full border text-xs " +
              (n <= step
                ? "border-blue-400 bg-blue-500 text-white"
                : "border-gray-300 bg-white text-gray-500")
            }
          >
            {n}
          </span>
          {n < 3 && <span className="h-px w-8 bg-gray-300" />}
        </li>
      ))}
    </ol>
  );
}

function NameField() {
  const field = useField(nameOptions);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Name</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            field.validation.type === "valid" && "border-green-500",
            field.validation.type === "invalid" && "border-red-500",
          )}
          placeholder="Enter your full name"
        />
        <div className="mt-1 text-sm text-red-500">
          {field.validation.type === "invalid" &&
            field.validation.issues.map((i) => i.message).join(", ")}
        </div>
      </div>
    </label>
  );
}

function EmailField() {
  const field = useField(emailOptions);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Email</span>
      <div className="relative">
        <input
          type="text"
          name={field.name}
          value={field.value}
          onChange={(e) => {
            field.setValue(e.target.value);
          }}
          onBlur={field.blur}
          maxLength={254}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 p-2 pr-10 outline-none",
            field.validation.type === "valid" && "border-green-500",
            field.validation.type === "invalid" && "border-red-500",
          )}
          placeholder="Enter your email"
        />
        <div className="mt-1 text-sm text-red-500">
          {field.validation.type === "invalid" &&
            field.validation.issues.map((i) => i.message).join(", ")}
        </div>
      </div>
    </label>
  );
}

function CountryField() {
  const field = useField(countryOptions);
  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">Country</span>
      <div className="relative">
        <select
          name={field.name}
          value={field.value}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "" || isCountryNonEmpty(next)) {
              field.setValue(next);
            }
          }}
          onBlur={field.blur}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 bg-white p-2 pr-10 outline-none",
            field.validation.type === "valid" && "border-green-500",
            field.validation.type === "invalid" && "border-red-500",
          )}
        >
          <option value="">Select a country</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function CityField() {
  const field = useField(cityOptions);

  const isEnabled = field.value.allowedCities.length > 0;

  return (
    <label className="flex flex-col gap-2">
      <span className="px-2 text-sm font-medium">City</span>
      <div className="relative">
        <select
          name={field.name}
          value={field.value.city}
          onChange={(e) => {
            const next = e.target.value as City;

            field.setValue({
              ...field.value,
              city: next,
            });
          }}
          onBlur={field.blur}
          className={cn(
            "w-full rounded-md border-2 border-gray-300 bg-white p-2 pr-10 outline-none",
            field.validation.type === "valid" && "border-green-500",
            field.validation.type === "invalid" && "border-red-500",
          )}
          disabled={!isEnabled}
        >
          <option value="">
            {isEnabled
              ? `Select a city in ${field.formApi.getSnapshot("country").value}`
              : "Select a country first"}
          </option>
          {field.value.allowedCities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </label>
  );
}

function ReviewSection() {
  const snapshot = useFormSelector(reviewSnapshotSelector);
  return (
    <div className="space-y-2 rounded-md border border-gray-200 p-4">
      <div className="text-sm text-gray-600">Review your details</div>
      <ul className="space-y-1 text-sm">
        <li>
          <span className="font-medium">Name:</span> {snapshot.name || "—"}
        </li>
        <li>
          <span className="font-medium">Email:</span> {snapshot.email || "—"}
        </li>
        <li>
          <span className="font-medium">Country:</span>{" "}
          {snapshot.country || "—"}
        </li>
        <li>
          <span className="font-medium">City:</span> {snapshot.city || "—"}
        </li>
      </ul>
    </div>
  );
}

function NextButton({ step }: Readonly<{ step: Step }>) {
  const canProceed = useFormSelector(isCurrentStepValid, {
    props: { step },
  });

  return (
    <button
      type="submit"
      className="rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 focus:outline-none disabled:opacity-50"
      disabled={!canProceed}
    >
      Next
    </button>
  );
}

function SubmitButton() {
  const canSubmit = useFormSelector(isAllValid);
  return (
    <button
      type="submit"
      className="rounded-md border-2 border-green-300 bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none disabled:opacity-50"
      disabled={!canSubmit}
    >
      Submit
    </button>
  );
}
