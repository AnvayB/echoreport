import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";
import { toast } from "sonner";

const Login = () => {
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error("Login failed. Please try again.");
        console.error(result.error);
      }
    } catch (e) {
      toast.error("Login failed. Please try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Work Journal</CardTitle>
          <CardDescription>Track your daily accomplishments and generate weekly reports</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGoogleLogin} disabled={loading} className="w-full" size="lg">
            {loading ? "Signing in…" : "Sign in with Google"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
