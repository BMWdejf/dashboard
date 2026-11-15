import { signIn } from '../actions';
import { AuthForm } from '../AuthForm';

export default function SignInPage() {
  return <AuthForm mode="sign-in" action={signIn} />;
}
