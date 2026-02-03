import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { skuAPI } from "@/utils/api";
import {
  Package,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download,
  Info
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export default function UpdateSku() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
      ];
      
      if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.csv')) {
        toast({
          title: "Invalid file type",
          description: "Please select an Excel (.xlsx, .xls) or CSV file.",
          variant: "destructive",
        });
        return;
      }

      // Validate file size (max 10MB)
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 10MB.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    // Progress simulation while uploading
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    try {
      // Call actual API
      const response = await skuAPI.uploadFile(selectedFile);

      clearInterval(progressInterval);
      setUploadProgress(100);

      setUploadResult({
        success: response.success,
        message: response.message,
        details: {
          processedItems: response.processedItems,
          updatedItems: response.insertedItems,
          skippedItems: response.skippedItems,
          errors: response.errors
        }
      });

      toast({
        title: "Upload successful",
        description: `${response.insertedItems} new items added to the database.`,
      });

    } catch (error: any) {
      clearInterval(progressInterval);
      console.error('Upload error:', error);

      setUploadResult({
        success: false,
        message: error.message || "Failed to upload SKU data",
        details: error.data || error
      });

      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading your file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const downloadTemplate = () => {
    // TODO: Implement template download
    toast({
      title: "Template download",
      description: "Template download will be implemented soon.",
    });
  };

  const resetUpload = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-bold text-foreground">StockTake</span>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            size="sm"
            className="text-xs sm:text-sm"
          >
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </Button>
        </div>
      </nav>

      <div className="container mx-auto px-4 sm:px-6 py-6 sm:py-8 max-w-4xl">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Update SKU Data
          </h1>
          <p className="text-muted-foreground">
            Upload an Excel or CSV file to update SKU information in bulk
          </p>
        </div>

        {/* Information Alert */}
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertTitle>File Format Requirements</AlertTitle>
          <AlertDescription>
            Your Excel file should include columns for: <strong>Particulars</strong>, <strong>Group</strong>, <strong>Sub-Group</strong>,
            <strong> UOM</strong>, <strong>FG/RM/PM</strong>, <strong>Sale Group</strong>, <strong>For Inventory</strong>.
            The file can contain multiple tables (e.g., CFPL and CDPL) with the same column structure.
            Only new items (not already in database) will be inserted.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Section */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Upload className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">Upload SKU File</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="sku-file">Select File</Label>
                  <Input
                    id="sku-file"
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Supported formats: Excel (.xlsx, .xls) or CSV files (max 10MB)
                  </p>
                </div>

                {selectedFile && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="text-sm font-medium">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {isUploading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Uploading...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleUpload}
                    disabled={!selectedFile || isUploading}
                    className="flex-1"
                  >
                    {isUploading ? "Uploading..." : "Upload File"}
                  </Button>
                  {selectedFile && (
                    <Button
                      variant="outline"
                      onClick={resetUpload}
                      disabled={isUploading}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Results Section */}
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              {uploadResult ? (
                uploadResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )
              ) : (
                <FileSpreadsheet className="w-5 h-5 text-muted-foreground" />
              )}
              <h2 className="text-lg font-semibold">Upload Results</h2>
            </div>

            {!uploadResult && (
              <div className="text-center py-8 text-muted-foreground">
                <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>Upload a file to see results here</p>
              </div>
            )}

            {uploadResult && (
              <div className="space-y-4">
                <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  <AlertDescription>
                    {uploadResult.message}
                  </AlertDescription>
                </Alert>

                {uploadResult.success && uploadResult.details && (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="font-medium text-blue-900">Processed</p>
                      <p className="text-lg font-bold text-blue-600">
                        {uploadResult.details.processedItems}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="font-medium text-green-900">Updated</p>
                      <p className="text-lg font-bold text-green-600">
                        {uploadResult.details.updatedItems}
                      </p>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-lg">
                      <p className="font-medium text-yellow-900">Skipped</p>
                      <p className="text-lg font-bold text-yellow-600">
                        {uploadResult.details.skippedItems}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 rounded-lg">
                      <p className="font-medium text-red-900">Errors</p>
                      <p className="text-lg font-bold text-red-600">
                        {uploadResult.details.errors}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="mt-6 p-6">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <Button variant="outline" onClick={() => navigate("/resultsheet")}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              View Current Data
            </Button>
            <Button variant="outline" onClick={resetUpload}>
              <Upload className="w-4 h-4 mr-2" />
              Upload Another File
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}