import { createContext, use, useCallback, useMemo, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { mutative } from "zustand-mutative";
import { useShallow } from "zustand/react/shallow";
import { deepEqual } from "@lib/deep-equal";
import { useIsomorphicEffect } from "@lib/use-isomorphic-effect";

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

type DefaultValues = Record<string, unknown>;

type FieldsMap<T extends DefaultValues> = {
  [K in keyof T]: Field<T[K]>;
};

type ValidatorsMap<T extends DefaultValues> = {
  [K in keyof T]?: FieldValidators<T, K, Exclude<keyof T, K>>;
};

type DependenciesMap<T extends DefaultValues> = {
  [K in keyof T]?: readonly (keyof T)[];
};

type FieldEntries<T extends DefaultValues> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

type DependencyFields<T extends DefaultValues, D extends keyof T> = Prettify<
  Pick<FieldsMap<T>, D>
>;

interface OnDoneChangeProps<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
}

type Validator<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> = (props: {
  value: T[K];
  fieldApi: {
    meta: Field<T[K]>["meta"];
    setIssue: (issue?: string) => void;
    setDone: (isDone: boolean) => void;
    formApi: {
      dependencies: DependencyFields<T, D>;
    };
  };
}) => void;

interface FieldValidators<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  readonly onBlur?: Validator<T, K, D>;
  readonly onSubmit?: Validator<T, K, D>;
  readonly onChange?: Validator<T, K, D>;
  readonly onMount?: Validator<T, K, D>;
}

interface Field<T = unknown> {
  value: T;
  meta: {
    isTouched: boolean;
    numberOfChanges: number;
    numberOfSubmissions: number;
    isDone: boolean;
    issue?: string;
  };
}

interface FormApi<T extends DefaultValues, D extends keyof T = never> {
  submit: (fields?: readonly (keyof T)[]) => void;
  dependencies: DependencyFields<T, D>;
}

interface FieldApi<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
> {
  name: K;
  value: T[K];
  handleChange: (value: T[K]) => void;
  handleSubmit: () => void;
  handleBlur: () => void;
  setIssue: (issue: string | undefined) => void;
  setDone: (isDone: boolean) => void;
  meta: Field<T[K]>["meta"];
  formApi: Prettify<FormApi<T, D>>;
}

interface Store<T extends DefaultValues> {
  fieldsMap: FieldsMap<T>;
  validatorsMap: ValidatorsMap<T>;
  dependenciesMap: DependenciesMap<T>;
}

interface Actions<T extends DefaultValues> {
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  submit: (fields?: readonly (keyof T)[]) => void;
  setIssue: (field: keyof T, issue?: string) => void;
  setDone: (field: keyof T, isDone: boolean) => void;
  setValidators: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
    field: K,
    validators?: FieldValidators<T, K, D>,
  ) => void;
  setDependencies: <K extends keyof T>(
    field: K,
    dependencies?: readonly Exclude<keyof T, K>[],
  ) => void;
}

function createInitialFieldsMap<T extends DefaultValues>(
  defaultValues: T,
): FieldsMap<T> {
  const entries = Object.entries(defaultValues) as FieldEntries<T>;

  return Object.fromEntries(
    entries.map(([field, defaultValue]) => [
      field,
      {
        value: defaultValue,
        meta: {
          isTouched: false,
          numberOfChanges: 0,
          numberOfSubmissions: 0,
          isDone: false,
        },
      },
    ]),
  ) as FieldsMap<T>;
}

function createDependencyFields<T extends DefaultValues, K extends keyof T>(
  fieldsMap: FieldsMap<T>,
  dependencies: readonly (keyof T)[],
): DependencyFields<T, Exclude<keyof T, K>> {
  return Object.fromEntries(
    dependencies.map((dep) => [dep, fieldsMap[dep]]),
  ) as DependencyFields<T, Exclude<keyof T, K>>;
}

function getFieldNames<T extends DefaultValues>(
  fieldsMap: FieldsMap<T>,
): (keyof T)[] {
  return Object.keys(fieldsMap) as (keyof T)[];
}

function createFormStoreMutative<T extends DefaultValues>(options: {
  defaultValues: T;
  onDoneChange?: (props: OnDoneChangeProps<T>) => void;
}) {
  return createStore<Store<T> & Actions<T>>()(
    mutative((set, get) => ({
      validatorsMap: {} as ValidatorsMap<T>,
      dependenciesMap: {} as DependenciesMap<T>,
      setValidators: <K extends keyof T, D extends Exclude<keyof T, K> = never>(
        field: K,
        validators?: FieldValidators<T, K, D>,
      ) => {
        set((state) => {
          (state.validatorsMap as ValidatorsMap<T>)[field] = validators;
        });
      },
      fieldsMap: createInitialFieldsMap(options.defaultValues),
      setValue: <K extends keyof T>(field: K, value: T[K]) => {
        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          if (deepEqual(fieldsMap[field].value, value)) {
            return;
          }

          fieldsMap[field].value = value;
          fieldsMap[field].meta.isTouched = true;
          fieldsMap[field].meta.numberOfChanges++;
        });

        const snapshot = get();
        const dependencies = snapshot.dependenciesMap[field] || [];
        const dependenciesData = createDependencyFields<T, K>(
          snapshot.fieldsMap,
          dependencies,
        );

        snapshot.validatorsMap[field]?.onChange?.({
          value: value,
          fieldApi: {
            meta: snapshot.fieldsMap[field].meta,
            setIssue: (issue?: string) => {
              snapshot.setIssue(field, issue);
            },
            setDone: (isDone: boolean) => {
              snapshot.setDone(field, isDone);
            },
            formApi: {
              dependencies: dependenciesData,
            },
          },
        });
      },
      submit: (fields?: readonly (keyof T)[]) => {
        const snapshot = get();
        const fieldsToSubmit = fields ?? getFieldNames(snapshot.fieldsMap);

        for (const fieldName of fieldsToSubmit) {
          set((state) => {
            (state.fieldsMap as FieldsMap<T>)[fieldName].meta
              .numberOfSubmissions++;
          });

          const dependencies = snapshot.dependenciesMap[fieldName] || [];
          const dependenciesData = createDependencyFields<T, typeof fieldName>(
            snapshot.fieldsMap,
            dependencies,
          );

          snapshot.validatorsMap[fieldName]?.onSubmit?.({
            value: snapshot.fieldsMap[fieldName].value,
            fieldApi: {
              meta: snapshot.fieldsMap[fieldName].meta,
              setIssue: (issue?: string) => {
                snapshot.setIssue(fieldName, issue);
              },
              setDone: (isDone: boolean) => {
                snapshot.setDone(fieldName, isDone);
              },
              formApi: {
                dependencies: dependenciesData,
              },
            },
          });
        }
      },
      setIssue: (field: keyof T, issue?: string) => {
        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          fieldsMap[field].meta.issue = issue;

          if (issue) {
            fieldsMap[field].meta.isDone = false;
          }
        });
      },
      setDone: (field: keyof T, isDone: boolean) => {
        const prevIsDone = get().fieldsMap[field].meta.isDone;

        set((state) => {
          const fieldsMap = state.fieldsMap as FieldsMap<T>;
          fieldsMap[field].meta.isDone = isDone;
          fieldsMap[field].meta.isTouched = true;
          fieldsMap[field].meta.issue = undefined;
        });

        if (prevIsDone !== isDone && options.onDoneChange) {
          const snapshot = get();
          options.onDoneChange({ fieldsMap: snapshot.fieldsMap });
        }
      },
      setDependencies: <K extends keyof T>(
        field: K,
        dependencies?: readonly Exclude<keyof T, K>[],
      ) => {
        set((state) => {
          (state.dependenciesMap as DependenciesMap<T>)[field] =
            dependencies ?? [];
        });
      },
    })),
  );
}

const FormContext = createContext<StoreApi<
  Store<DefaultValues> & Actions<DefaultValues>
> | null>(null);

function FormProvider({
  children,
  formStore,
}: {
  children: React.ReactNode;
  formStore: StoreApi<Store<DefaultValues> & Actions<DefaultValues>>;
}) {
  return <FormContext value={formStore}>{children}</FormContext>;
}

function Field<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
>(props: {
  name: K;
  validators?: FieldValidators<T, K, D>;
  dependencies?: readonly D[];
  render: (props: FieldApi<T, K, D>) => React.ReactNode;
}) {
  const field = useField<T, K, D>({
    name: props.name,
    validators: props.validators,
    dependencies: props.dependencies,
  });

  return props.render(field);
}

function SubscribeTo<T extends DefaultValues, K extends keyof T>(props: {
  dependencies: readonly K[];
  render: (fieldsMap: Prettify<Pick<FieldsMap<T>, K>>) => React.ReactNode;
}) {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const selector = useShallow(
    (state: Store<T>): Pick<FieldsMap<T>, K> =>
      Object.fromEntries(
        props.dependencies.map((name) => [name, state.fieldsMap[name]]),
      ) as Pick<FieldsMap<T>, K>,
  );

  const fields = useStore(formStore, selector);

  return props.render(fields);
}

function useField<
  T extends DefaultValues,
  K extends keyof T,
  D extends Exclude<keyof T, K> = never,
>(options: {
  name: K;
  validators?: FieldValidators<T, K, D>;
  dependencies?: readonly D[];
}): FieldApi<T, K, D> {
  const formStore = use(FormContext) as StoreApi<Store<T> & Actions<T>> | null;

  if (!formStore) {
    throw new Error("FormProvider is not found");
  }

  const dependenciesArray = useMemo(
    () => options.dependencies ?? ([] as readonly D[]),
    [options.dependencies],
  );

  const dependencies = useStore(
    formStore,
    useShallow(
      (state: Store<T>): DependencyFields<T, D> =>
        Object.fromEntries(
          dependenciesArray.map((name) => [name, state.fieldsMap[name]]),
        ) as DependencyFields<T, D>,
    ),
  );
  const field = useStore(
    formStore,
    useShallow((state: Store<T>) => state.fieldsMap[options.name]),
  );
  const setValue = useStore(formStore, (state) => state.setValue);
  const submit = useStore(formStore, (state) => state.submit);
  const setIssueToStore = useStore(formStore, (state) => state.setIssue);
  const setDoneToStore = useStore(formStore, (state) => state.setDone);

  useIsomorphicEffect(() => {
    if (
      !deepEqual(
        dependenciesArray,
        formStore.getState().dependenciesMap[options.name],
      )
    ) {
      formStore.getState().setDependencies(options.name, dependenciesArray);
    }

    if (
      !deepEqual(
        options.validators,
        formStore.getState().validatorsMap[options.name],
      )
    ) {
      formStore.getState().setValidators(options.name, options.validators);
    }
  }, [dependenciesArray, formStore, options.name, options.validators]);

  const handleChange = (value: T[K]) => {
    setValue(options.name, value);
  };

  const handleSubmit = () => {
    submit([options.name]);
  };

  const formApi: FormApi<T, D> = {
    submit: (fields?: readonly (keyof T)[]) => {
      submit(fields);
    },
    dependencies,
  };

  const setIssue = useCallback(
    (issue?: string) => {
      setIssueToStore(options.name, issue);
    },
    [options.name, setIssueToStore],
  );

  const setDone = useCallback(
    (isDone: boolean) => {
      setDoneToStore(options.name, isDone);
    },
    [options.name, setDoneToStore],
  );

  const handleBlur = () => {
    options.validators?.onBlur?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        setIssue,
        setDone,
        formApi: {
          dependencies,
        },
      },
    });
  };

  useIsomorphicEffect(() => {
    options.validators?.onMount?.({
      value: field.value,
      fieldApi: {
        meta: field.meta,
        setIssue,
        setDone,
        formApi: {
          dependencies,
        },
      },
    });
  }, [
    dependencies,
    field.meta,
    field.value,
    options.validators,
    setDone,
    setIssue,
  ]);

  return {
    name: options.name,
    value: field.value,
    meta: field.meta,
    handleChange,
    handleSubmit,
    handleBlur,
    setIssue,
    setDone,
    formApi,
  };
}

export function useForm<T extends DefaultValues>(options: {
  defaultValues: T;
  onDoneChange?: (props: OnDoneChangeProps<T>) => void;
}) {
  const [formStore] = useState(() => createFormStoreMutative(options));

  type BoundedField = <
    K extends keyof T,
    D extends Exclude<keyof T, K> = never,
  >(props: {
    name: K;
    validators?: FieldValidators<T, K, D>;
    dependencies?: readonly D[];
    render: (props: Prettify<FieldApi<T, K, D>>) => React.ReactNode;
  }) => React.ReactNode;

  type BoundedSubscribeTo = <K extends keyof T>(props: {
    dependencies: readonly K[];
    render: (fieldsMap: Prettify<Pick<FieldsMap<T>, K>>) => React.ReactNode;
  }) => React.ReactNode;

  return {
    Field: Field as BoundedField,
    SubscribeTo: SubscribeTo as BoundedSubscribeTo,
    formStore,
    Form: (props: React.ComponentProps<"form">) => (
      <FormProvider
        formStore={
          formStore as StoreApi<Store<DefaultValues> & Actions<DefaultValues>>
        }
      >
        <form {...props} />
      </FormProvider>
    ),
  };
}
