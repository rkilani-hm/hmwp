import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Printer, 
  Download,
  HardHat,
  Users,
  Shield,
  Settings,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileCheck,
  Send,
  Eye,
  Edit,
  XCircle,
  RefreshCw,
  BarChart3,
  Building,
  Wrench,
  QrCode,
  Bell,
} from 'lucide-react';

const UserManuals = () => {
  const [activeTab, setActiveTab] = useState('internal');
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const manualTitle = {
      internal: 'Internal Workflow User Manual - Contractors',
      client: 'Client User Manual',
      approver: 'Approver User Manual',
      admin: 'Administrator User Manual',
    }[activeTab] || 'User Manual';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${manualTitle} - Al Hamra Work Permit System</title>
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px;
            }
            h1 { color: #1a365d; border-bottom: 3px solid #3182ce; padding-bottom: 10px; }
            h2 { color: #2c5282; margin-top: 30px; border-bottom: 1px solid #bee3f8; padding-bottom: 5px; }
            h3 { color: #2d3748; margin-top: 20px; }
            .section { margin-bottom: 30px; }
            .step { background: #f7fafc; padding: 15px; margin: 10px 0; border-left: 4px solid #3182ce; }
            .warning { background: #fffaf0; padding: 15px; margin: 10px 0; border-left: 4px solid #ed8936; }
            .tip { background: #f0fff4; padding: 15px; margin: 10px 0; border-left: 4px solid #38a169; }
            ul { margin: 10px 0; padding-left: 25px; }
            li { margin: 5px 0; }
            .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #718096; }
            @media print {
              body { padding: 20px; }
              .step, .warning, .tip { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
          <div class="footer">
            <p>Al Hamra Work Permit System - ${manualTitle}</p>
            <p>Generated on: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">User Manuals</h1>
            <p className="text-muted-foreground">Comprehensive guides for all user roles</p>
          </div>
        </div>
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="internal" className="gap-2">
            <Building className="h-4 w-4" />
            Internal Workflow
          </TabsTrigger>
          <TabsTrigger value="client" className="gap-2">
            <HardHat className="h-4 w-4" />
            Client
          </TabsTrigger>
          <TabsTrigger value="approver" className="gap-2">
            <Users className="h-4 w-4" />
            Approver
          </TabsTrigger>
          <TabsTrigger value="admin" className="gap-2">
            <Shield className="h-4 w-4" />
            Administrator
          </TabsTrigger>
        </TabsList>

        <Card className="mt-4">
          <CardContent className="p-6">
            <ScrollArea className="h-[calc(100vh-280px)]">
              <div ref={printRef}>
                {/* Internal Workflow Manual */}
                <TabsContent value="internal" className="mt-0">
                  <InternalWorkflowManual />
                </TabsContent>

                {/* Client Manual */}
                <TabsContent value="client" className="mt-0">
                  <ClientManual />
                </TabsContent>

                {/* Approver Manual */}
                <TabsContent value="approver" className="mt-0">
                  <ApproverManual />
                </TabsContent>

                {/* Admin Manual */}
                <TabsContent value="admin" className="mt-0">
                  <AdminManual />
                </TabsContent>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
};

// Internal Workflow Manual Component
const InternalWorkflowManual = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-primary mb-2">Internal Workflow User Manual</h1>
      <p className="text-lg text-muted-foreground">For Contractors Using Internal Work Permit System</p>
    </div>

    <Separator />

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        1. Overview
      </h2>
      <p>
        The Al Hamra Work Permit System is designed to streamline the process of requesting, 
        reviewing, and approving work permits for internal operations. This manual covers 
        the internal workflow used for facility maintenance, renovations, and other internal work.
      </p>
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <p className="font-medium">Internal Workflow Path:</p>
        <p className="text-sm mt-1">
          Contractor → Helpdesk → Department Approvers (PM, PD, BDCR, MPR, IT, Fit-Out) → 
          Ecovert Supervisor → PMD Coordinator → Final Approval
        </p>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        2. Submitting a Work Permit
      </h2>
      
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 1: Access the New Permit Form</h3>
          <p className="text-sm mt-1">Navigate to "New Permit" from the sidebar menu.</p>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 2: Fill in Requester Information</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Enter your full name and email address</li>
            <li>Provide contractor company name</li>
            <li>Add contact mobile number</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 3: Specify Work Details</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Select the work location (Building, Floor, Unit)</li>
            <li>Choose the work type (determines approval workflow)</li>
            <li>Enter work dates and times</li>
            <li>Provide detailed work description</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 4: Attach Supporting Documents</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Upload method statements, risk assessments, or drawings</li>
            <li>Supported formats: PDF, JPG, PNG</li>
            <li>Maximum file size: 10MB per file</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 5: Submit the Permit</h3>
          <p className="text-sm mt-1">Review all information and click "Submit Permit".</p>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" />
        3. Tracking Your Permit
      </h2>
      <ul className="list-disc list-inside space-y-2">
        <li>View all your permits in "My Permits" section</li>
        <li>Track real-time status with the workflow timeline</li>
        <li>Receive notifications when status changes</li>
        <li>Download approved permit PDF with QR code</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        4. Handling Rework Requests
      </h2>
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
        <p className="font-medium">When a permit needs rework:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li>You will receive a notification with specific comments</li>
          <li>Navigate to the permit and click "Edit"</li>
          <li>Address all feedback from the approver</li>
          <li>Resubmit the permit for approval</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        5. Using the Approved Permit
      </h2>
      <ul className="list-disc list-inside space-y-2">
        <li>Download and print the approved permit PDF</li>
        <li>Display the permit at the work site</li>
        <li>Security can scan the QR code to verify authenticity</li>
        <li>Keep the permit visible throughout the work duration</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        6. Permit Status Reference
      </h2>
      <div className="grid gap-2">
        <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded">
          <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
          <span className="font-medium">Draft</span>
          <span className="text-sm text-muted-foreground">- Permit saved but not submitted</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-blue-50 rounded">
          <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
          <span className="font-medium">Submitted</span>
          <span className="text-sm text-muted-foreground">- Awaiting initial review</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-purple-50 rounded">
          <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
          <span className="font-medium">Under Review</span>
          <span className="text-sm text-muted-foreground">- Being processed by Helpdesk</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-orange-50 rounded">
          <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
          <span className="font-medium">Pending [Role]</span>
          <span className="text-sm text-muted-foreground">- Awaiting specific department approval</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-green-50 rounded">
          <span className="w-3 h-3 bg-green-500 rounded-full"></span>
          <span className="font-medium">Approved</span>
          <span className="text-sm text-muted-foreground">- All approvals complete, work can begin</span>
        </div>
        <div className="flex items-center gap-2 p-2 bg-red-50 rounded">
          <span className="w-3 h-3 bg-red-500 rounded-full"></span>
          <span className="font-medium">Rejected</span>
          <span className="text-sm text-muted-foreground">- Permit denied, see comments</span>
        </div>
      </div>
    </section>
  </div>
);

// Client Manual Component
const ClientManual = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-primary mb-2">Client User Manual</h1>
      <p className="text-lg text-muted-foreground">For External Clients Requesting Work Permits</p>
    </div>

    <Separator />

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        1. Overview
      </h2>
      <p>
        As a client, you can request work permits for your retail space, office, or 
        other leased areas within Al Hamra properties. This guide explains the client 
        workflow which routes through Customer Service and CR departments.
      </p>
      <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
        <p className="font-medium">Client Workflow Path:</p>
        <p className="text-sm mt-1">
          Client → Customer Service → CR Coordinator → Head of CR → FMSP Approval → Complete
        </p>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <HardHat className="h-5 w-5 text-primary" />
        2. Getting Started
      </h2>
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Account Setup</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Register with your business email</li>
            <li>Complete your profile with company information</li>
            <li>You will be assigned the "Client" role</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Dashboard Overview</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>View summary of your submitted permits</li>
            <li>Track pending permits requiring action</li>
            <li>See recently approved permits</li>
            <li>Access rework requests that need your attention</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        3. Submitting a Work Permit
      </h2>
      
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 1: Click "New Permit"</h3>
          <p className="text-sm mt-1">Access the permit creation wizard from your dashboard.</p>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 2: Enter Your Information</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Your name and email (auto-filled from profile)</li>
            <li>Your company/business name</li>
            <li>Contact phone number</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 3: Specify Work Location</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Select your leased unit/shop location</li>
            <li>Specify floor and unit number</li>
            <li>For common areas, select "Other" and describe</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 4: Describe the Work</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Select the type of work (fit-out, maintenance, etc.)</li>
            <li>Choose start and end dates</li>
            <li>Specify working hours</li>
            <li>Provide detailed description of activities</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Step 5: Attach Documents</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Contractor details and licenses</li>
            <li>Insurance certificates</li>
            <li>Floor plans or drawings if applicable</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Eye className="h-5 w-5 text-primary" />
        4. Monitoring Your Permits
      </h2>
      <ul className="list-disc list-inside space-y-2">
        <li><strong>My Permits:</strong> View all submitted permits and their status</li>
        <li><strong>Timeline View:</strong> See which approval stage your permit is at</li>
        <li><strong>Notifications:</strong> Receive alerts for status changes and actions needed</li>
        <li><strong>Comments:</strong> View feedback from approvers</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        5. Notifications
      </h2>
      <p>Stay informed about your permit status:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>Email notifications for all status changes</li>
        <li>In-app notification bell shows unread alerts</li>
        <li>Push notifications (if enabled) for urgent updates</li>
        <li>Enable push notifications in Settings for real-time alerts</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Download className="h-5 w-5 text-primary" />
        6. Downloading Approved Permits
      </h2>
      <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
        <p className="font-medium">Once approved:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li>Open the permit details page</li>
          <li>Click "Download PDF"</li>
          <li>The PDF includes a QR code for verification</li>
          <li>Print and display at the work site</li>
        </ul>
      </div>
    </section>
  </div>
);

// Approver Manual Component
const ApproverManual = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-primary mb-2">Approver User Manual</h1>
      <p className="text-lg text-muted-foreground">For Department Heads and Approval Officers</p>
    </div>

    <Separator />

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        1. Overview
      </h2>
      <p>
        As an approver, you are responsible for reviewing work permits that require your 
        department's approval. This includes verifying safety requirements, compliance, 
        and operational feasibility.
      </p>
      <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
        <p className="font-medium">Approver Roles Include:</p>
        <p className="text-sm mt-1">
          Helpdesk, Property Management, Project Development, BDCR, MPR, IT, Fit-Out, 
          Customer Service, CR Coordinator, Head of CR, Ecovert Supervisor, PMD Coordinator, 
          and FMSP Approval.
        </p>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        2. Your Inbox
      </h2>
      <div className="space-y-3">
        <p>The Inbox shows all permits awaiting your approval:</p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Pending Count:</strong> Badge shows number of permits needing action</li>
          <li><strong>SLA Indicators:</strong> Yellow/red warnings for approaching/breached deadlines</li>
          <li><strong>Quick Filters:</strong> Filter by work type, location, or date</li>
          <li><strong>Sort Options:</strong> Sort by urgency, date, or SLA status</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <CheckCircle className="h-5 w-5 text-primary" />
        3. Approving a Permit
      </h2>
      
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-green-500">
          <h3 className="font-medium">Step 1: Review Permit Details</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Click on the permit to view full details</li>
            <li>Review work description, dates, and location</li>
            <li>Check attached documents (method statements, drawings)</li>
            <li>Review any previous approver comments</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-green-500">
          <h3 className="font-medium">Step 2: Make Your Decision</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li><strong>Approve:</strong> If all requirements are met</li>
            <li><strong>Reject:</strong> If work cannot be permitted</li>
            <li><strong>Request Rework:</strong> If changes are needed</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-green-500">
          <h3 className="font-medium">Step 3: Provide Signature</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Enter your password to verify identity</li>
            <li>Draw your signature on the signature pad</li>
            <li>Add any comments or conditions</li>
            <li>Confirm the action</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <XCircle className="h-5 w-5 text-primary" />
        4. Rejecting a Permit
      </h2>
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <p className="font-medium">When rejecting a permit:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li>Rejection is final and cannot be undone</li>
          <li>You MUST provide a clear reason for rejection</li>
          <li>The requester will be notified immediately</li>
          <li>They will need to submit a new permit if they wish to proceed</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <RefreshCw className="h-5 w-5 text-primary" />
        5. Requesting Rework
      </h2>
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
        <p className="font-medium">Use rework when:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li>Minor corrections or clarifications are needed</li>
          <li>Additional documents are required</li>
          <li>Dates or times need adjustment</li>
          <li>Provide specific instructions for what needs to change</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Send className="h-5 w-5 text-primary" />
        6. Your Outbox
      </h2>
      <p>View permits you have already acted on:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>See all permits you have approved, rejected, or sent for rework</li>
        <li>Track the current status of permits after your action</li>
        <li>Review your comments and decisions</li>
        <li>Filter by action type or date range</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        7. My Performance
      </h2>
      <p>Monitor your approval metrics:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>Average approval time</li>
        <li>Number of permits processed</li>
        <li>SLA compliance rate</li>
        <li>Approval/rejection/rework ratio</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        8. SLA Guidelines
      </h2>
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <p className="font-medium">Response Time Expectations:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li><strong>Urgent permits:</strong> 4 hours</li>
          <li><strong>Normal permits:</strong> 24 hours</li>
          <li><strong>Low priority:</strong> 48 hours</li>
          <li>SLA breaches are tracked and reported to management</li>
        </ul>
      </div>
    </section>
  </div>
);

// Admin Manual Component
const AdminManual = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-3xl font-bold text-primary mb-2">Administrator User Manual</h1>
      <p className="text-lg text-muted-foreground">Complete System Administration Guide</p>
    </div>

    <Separator />

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <FileText className="h-5 w-5 text-primary" />
        1. Overview
      </h2>
      <p>
        Administrators have full access to all system features including user management, 
        workflow configuration, reporting, and system settings. This manual covers all 
        administrative functions.
      </p>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        2. User Management
      </h2>
      
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Creating New Users</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Navigate to Admin → User Management</li>
            <li>Click "Add User"</li>
            <li>Enter email, name, and temporary password</li>
            <li>Assign appropriate roles</li>
            <li>User will receive email with login instructions</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Managing User Roles</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Users can have multiple roles</li>
            <li>Roles determine what permits they can approve</li>
            <li>Contractors/Clients can only submit permits</li>
            <li>Approvers can review permits for their department</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Deactivating Users</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Toggle the "Active" status to disable access</li>
            <li>Deactivated users cannot log in</li>
            <li>Their historical data is preserved</li>
            <li>Pending approvals may need reassignment</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        3. Roles & Permissions
      </h2>
      
      <div className="space-y-3">
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Managing Roles</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Navigate to Admin → Roles</li>
            <li>View all system and custom roles</li>
            <li>Create new roles for specific needs</li>
            <li>System roles (contractor, admin) cannot be deleted</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Configuring Permissions</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Navigate to Admin → Permissions</li>
            <li>Assign permissions to roles</li>
            <li>Permissions control feature access</li>
            <li>Changes take effect on next login</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Wrench className="h-5 w-5 text-primary" />
        4. Work Types Configuration
      </h2>
      <div className="space-y-3">
        <p>Work types determine the approval workflow:</p>
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Creating/Editing Work Types</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Navigate to Admin → Work Types</li>
            <li>Define work type name (e.g., "Electrical Work", "Fit-Out")</li>
            <li>Select required approvers for this work type</li>
            <li>Assign a workflow template</li>
          </ul>
        </div>
        
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
          <p className="font-medium">Important:</p>
          <p className="text-sm mt-1">
            Changes to work types only affect new permits. Existing permits retain 
            their original workflow configuration.
          </p>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Building className="h-5 w-5 text-primary" />
        5. Work Locations
      </h2>
      <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
        <h3 className="font-medium">Managing Locations</h3>
        <ul className="text-sm mt-1 list-disc list-inside space-y-1">
          <li>Navigate to Admin → Work Locations</li>
          <li>Add buildings, floors, or specific areas</li>
          <li>Set location type (shop, common area, etc.)</li>
          <li>Location type may affect workflow routing</li>
          <li>Deactivate locations no longer in use</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-primary" />
        6. Workflow Builder
      </h2>
      <div className="space-y-3">
        <p>Create and manage approval workflows:</p>
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Creating Workflows</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li>Navigate to Admin → Workflow Builder</li>
            <li>Create workflow template (Internal or Client)</li>
            <li>Add approval steps in order</li>
            <li>Assign roles to each step</li>
            <li>Mark steps as required or optional</li>
          </ul>
        </div>
        
        <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
          <h3 className="font-medium">Workflow Types</h3>
          <ul className="text-sm mt-1 list-disc list-inside space-y-1">
            <li><strong>Internal:</strong> For contractor/internal work</li>
            <li><strong>Client:</strong> For external client requests</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        7. SLA Dashboard
      </h2>
      <p>Monitor system performance:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>View overall SLA compliance rates</li>
        <li>Identify bottlenecks in approval process</li>
        <li>Track average approval times by department</li>
        <li>See permits approaching or exceeding SLA</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        8. Reports
      </h2>
      <div className="bg-muted/50 p-4 rounded-lg border-l-4 border-primary">
        <h3 className="font-medium">Available Reports</h3>
        <ul className="text-sm mt-1 list-disc list-inside space-y-1">
          <li>Permit volume by status, type, and period</li>
          <li>Approver performance metrics</li>
          <li>Average processing times</li>
          <li>SLA breach analysis</li>
          <li>Export data to CSV for further analysis</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Activity className="h-5 w-5 text-primary" />
        9. Activity Logs
      </h2>
      <p>Complete audit trail of all system actions:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>User login/logout events</li>
        <li>Permit submissions and approvals</li>
        <li>Configuration changes</li>
        <li>Filter by user, action type, or date</li>
        <li>Export logs for compliance reporting</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-primary" />
        10. Stuck Permits Widget
      </h2>
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded">
        <p className="font-medium">Monitor permits stuck in pending status:</p>
        <ul className="text-sm mt-2 list-disc list-inside space-y-1">
          <li>Dashboard shows permits pending for 24+ hours</li>
          <li>Quick action to view permit details</li>
          <li>Resend notification to assigned approver</li>
          <li>Helps prevent SLA breaches</li>
        </ul>
      </div>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <QrCode className="h-5 w-5 text-primary" />
        11. QR Code Poster
      </h2>
      <p>Generate QR codes for permit verification:</p>
      <ul className="list-disc list-inside space-y-2">
        <li>Navigate to Admin → QR Code Poster</li>
        <li>Generate printable poster with QR code</li>
        <li>Display at security checkpoints</li>
        <li>Scanning verifies permit authenticity</li>
      </ul>
    </section>

    <section className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Settings className="h-5 w-5 text-primary" />
        12. System Settings
      </h2>
      <ul className="list-disc list-inside space-y-2">
        <li>Configure email notification templates</li>
        <li>Set SLA thresholds by urgency level</li>
        <li>Manage push notification settings</li>
        <li>Generate VAPID keys for push notifications</li>
      </ul>
    </section>
  </div>
);

// Missing icon import
const GitBranch = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" x2="6" y1="3" y2="15"></line>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <path d="M18 9a9 9 0 0 1-9 9"></path>
  </svg>
);

const Activity = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
  </svg>
);

const ClipboardCheck = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"></rect>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
    <path d="m9 14 2 2 4-4"></path>
  </svg>
);

export default UserManuals;
