import { useSubscribeTo } from "@/hooks/my-form";

export function NextButton() {
  const fields = useSubscribeTo({
    dependencies: ["email", "phone", "name"],
  });

  const isSomeValidating = Object.values(fields).some(
    (field) => field.meta.isValidating,
  );

  const isEveryDone = Object.values(fields).every((field) => field.meta.isDone);

  const isDisabled = isSomeValidating || !isEveryDone;

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
