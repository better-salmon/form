import { useFieldDependencies } from "@/hooks/my-form";

export function NextButton() {
  const dependencies = useFieldDependencies(["email", "name", "phone"]);

  const isDisabled = Object.values(dependencies).some(
    (field) =>
      field.validationState.type === "invalid" ||
      field.validationState.type === "warning",
  );

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
