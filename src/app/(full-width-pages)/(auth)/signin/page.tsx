import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Any Discussion",
  description: "Sign in to the anydiscussion dashboard.",
};

export default function SignIn() {
  return <SignInForm />;
}
