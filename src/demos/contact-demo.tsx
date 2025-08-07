import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { useForm } from "@/hooks/my-form";
import { Name } from "@/components/name";
import { Email } from "@/components/email";
import { Phone } from "@/components/phone";

const queryClient = new QueryClient();

function DemoQueryClient({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function ContactForm() {
  const { data: phone } = useQuery({
    queryKey: ["phone"],
    queryFn: async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return "1234567890";
    },
  });
  const { Form } = useForm({
    defaultValues: {
      name: {
        firstName: "",
        lastName: "",
      },
      email: "",
      phone,
    },
  });

  return (
    <Form className="mx-auto max-w-lg space-y-6">
      <div className="space-y-4 p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Contact Information</h2>
          <p className="mt-2 text-sm text-gray-600">
            Simple form with name, email, and phone validation
          </p>
        </div>

        <div className="space-y-4">
          <Name />
          <Email />
          <Phone />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            className="w-full rounded-md border-2 border-blue-300 bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 focus:outline-none"
          >
            Submit Contact Info
          </button>
        </div>
      </div>
    </Form>
  );
}

export function ContactDemo() {
  return (
    <DemoQueryClient>
      <ContactForm />
    </DemoQueryClient>
  );
}
