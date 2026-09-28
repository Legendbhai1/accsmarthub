import { Link } from "react-router";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/site/Logo";

export default function NotFound() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex min-h-screen flex-col"
    >
      <div className="px-4 py-5 sm:px-6">
        <Logo />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-24 text-center md:pb-0">
        <p className="text-7xl font-bold tracking-tight text-gradient sm:text-8xl">
          404
        </p>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
          <Button className="rounded-xl" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" /> Back to marketplace
            </Link>
          </Button>
          <Button variant="outline" className="rounded-xl" asChild>
            <Link to="/marketplace">Browse listings</Link>
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
