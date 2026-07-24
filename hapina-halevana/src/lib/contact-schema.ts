import { z } from "zod";

export const contactSchema = z.object({
  name: z.string().min(2, "Please enter your name").max(80),
  phone: z
    .string()
    .min(7, "Please enter a valid phone number")
    .max(24)
    .regex(/^[0-9+\-\s()]+$/, "Please enter a valid phone number"),
  email: z.string().email("Please enter a valid email").max(120).or(z.literal("")),
  topic: z.enum(["order", "catering", "reservation", "feedback", "other"]),
  message: z.string().min(10, "Tell us a little more (min. 10 characters)").max(1200),
  // honeypot — must stay empty
  company: z.string().max(0).optional(),
});

export type ContactInput = z.infer<typeof contactSchema>;

export const topicLabels: Record<ContactInput["topic"], string> = {
  order: "Placing an order",
  catering: "Catering / large group",
  reservation: "Reservation enquiry",
  feedback: "Feedback",
  other: "Something else",
};
