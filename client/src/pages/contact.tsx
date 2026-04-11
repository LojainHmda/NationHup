import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, MessageCircle, Loader2, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type CustomerProfile = {
  id: string;
  accountManagerId: string | null;
};

type AccountManager = {
  id: string;
  name: string;
  email: string;
  avatar?: string;
};

export default function ContactPage() {
  const { toast } = useToast();
  const [message, setMessage] = useState("");

  const { data: profile, isLoading: profileLoading } = useQuery<CustomerProfile>({
    queryKey: ["/api/customer/profile"],
  });

  const { data: accountManagers = [] } = useQuery<AccountManager[]>({
    queryKey: ["/api/account-managers"],
  });

  const assignedManager = profile?.accountManagerId
    ? accountManagers.find((m) => m.id === profile.accountManagerId)
    : null;

  // Mutation to send message to the backend
  const sendMessageMutation = useMutation({
    mutationFn: async (messageContent: string) => {
      await apiRequest("/api/customer/contact-manager", "POST", {
        message: messageContent,
        // Optionally send manager ID if backend needs to know who it's for
        // accountManagerId: assignedManager?.id,
      });
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your message has been sent to your account manager.",
      });
      setMessage(""); // Clear the input after success
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send message",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast({
        title: "Empty Message",
        description: "Please type a message before sending.",
        variant: "destructive",
      });
      return;
    }
    sendMessageMutation.mutate(message);
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE4438]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Contact Your Account Manager</h1>
          <p className="text-gray-500">Get in touch with your dedicated account representative</p>
        </div>

        <Card className="shadow-xl border-0 overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-[#FE4438] to-[#FE4438] text-white p-6">
            <CardTitle className="flex items-center gap-3 text-xl">
              <MessageCircle className="h-6 w-6" />
              Your Account Manager
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            {assignedManager ? (
              <div className="flex flex-col gap-8">
                {/* Manager Info Section */}
                <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FE4438] to-[#FE4438] flex items-center justify-center mb-6 shadow-lg">
                    {assignedManager.avatar ? (
                      <img
                        src={assignedManager.avatar}
                        alt={assignedManager.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <User className="h-12 w-12 text-white" />
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {assignedManager.name}
                  </h2>
                  <p className="text-gray-500 mb-6">Account Manager</p>

                  <div className="w-full space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="p-3 bg-[#FE4438]/10 rounded-lg">
                        <Mail className="h-5 w-5 text-[#FE4438]" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-gray-500">Email</p>
                        <a
                          href={`mailto:${assignedManager.email}`}
                          className="text-gray-900 font-medium hover:text-[#FE4438] transition-colors"
                        >
                          {assignedManager.email}
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="p-3 bg-[#FE4438]/10 rounded-lg">
                        <Phone className="h-5 w-5 text-[#FE4438]" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm text-gray-500">Phone</p>
                        <p className="text-gray-900 font-medium">Contact via email</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW: Message Form Section */}
                <div className="border-t border-gray-100 pt-8">
                  <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <Send className="h-5 w-5 text-[#FE4438]" />
                      Send a Message
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Have a question or request? Send a note directly to {assignedManager.name}.
                    </p>
                    <form onSubmit={handleSendMessage} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="message" className="text-sm font-medium text-gray-700">
                          Your Message
                        </Label>
                        <Textarea
                          id="message"
                          placeholder="Write your message here..."
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          className="min-h-[120px] resize-none focus:ring-2 focus:ring-[#FE4438] focus:border-[#FE4438]"
                          disabled={sendMessageMutation.isPending}
                        />
                      </div>
                      <Button
                        type="submit"
                        className="w-full bg-gradient-to-r from-[#FE4438] to-[#FE4438] hover:from-[#d99326] hover:to-[#d4841a] text-white shadow-lg transition-all duration-200"
                        disabled={sendMessageMutation.isPending}
                      >
                        {sendMessageMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="mr-2 h-4 w-4" />
                            Send Message
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
                  <User className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  No Account Manager Assigned
                </h3>
                <p className="text-gray-500">
                  An account manager has not been assigned to your account yet.
                  Please check back later or contact support.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}