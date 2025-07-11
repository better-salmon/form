import { useSubscribeTo } from "@/hooks/my-form";

export function NextButton() {
  const fields = useSubscribeTo({
    dependencies: ["name", "email", "phone"],
    render: (fieldsMap) => (
      <button type="submit" disabled={!fieldsMap.name.meta.isDone}>
        Submit
      </button>
    ),
  });

  const isDisabled = !Object.values(fields).every((field) => field.meta.isDone);

  return (
    <button
      type="submit"
      disabled={isDisabled}
      className="rounded-md border-2 border-gray-300 bg-blue-500 p-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
    >
      Next
    </button>
  );
}
