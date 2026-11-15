import { signUp } from '../actions';
import { AuthForm } from '../AuthForm';

export default function SignUpPage() {
  return <AuthForm mode="sign-up" action={signUp} />;
}
