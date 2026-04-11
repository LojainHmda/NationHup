import { useState, useRef } from "react";
import { Link } from "wouter";
import defaultHeroImage from "@assets/generated_images/walking_sneakers_right_side.png";
import { useQuery, useMutation } from "@tanstack/react-query";
import { 
  Package, 
  User, 
  Archive, 
  ChevronRight,
  Globe,
  History,
  LogOut,
  Star,
  Boxes,
  X,
  Camera,
  Upload,
  LinkIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAuthDrawer } from "@/contexts/AuthDrawerContext";
import { useProductMode } from "@/hooks/useProductMode";
import { useShopNavigation } from "@/hooks/useShopNavigation";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ASSET_URLS } from "@/lib/constants";
import { getBrandLogoDisplayUrl } from "@/lib/mediaUrl";
import type { Brand } from "@shared/schema";

interface OrderMethodCardProps {
  title: string;
  description: string;
  ctaText: string;
  onClick: () => void;
  cardBackgroundColor: string;
  icon: React.ReactNode;
  iconBgColor: string;
  iconColor: string;
  iconBorder?: string;
  dataTestId: string;
  titleStyle?: React.CSSProperties;
}

function OrderMethodCard({
  title,
  description,
  ctaText,
  onClick,
  cardBackgroundColor,
  icon,
  iconBgColor,
  iconColor,
  iconBorder,
  dataTestId,
  titleStyle = { fontFamily: "'Acumin Variable Concept', sans-serif", fontSize: '27px', fontWeight: 600, fontStretch: 'semi-expanded' },
}: OrderMethodCardProps) {
  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer group"
      style={{ width: '433px', height: '200px' }}
      data-testid={dataTestId}
    >
      <div
        className="absolute -top-5 right-4 z-10 flex items-center justify-center rounded-lg"
        style={{
          width: '40px',
          height: '40px',
          backgroundColor: iconBgColor,
          border: iconBorder ?? 'none',
        }}
      >
        <span style={{ color: iconColor }}>{icon}</span>
      </div>
      <div
        className="w-full h-full rounded-xl overflow-hidden flex flex-col justify-center px-8"
        style={{ backgroundColor: cardBackgroundColor }}
      >
        <h3 style={{ ...titleStyle, color: '#000000', marginBottom: '8px' }}>
          {title}
        </h3>
        <p style={{ fontFamily: 'Montserrat', fontSize: '14px', fontWeight: 400, color: '#000000', marginBottom: '16px', lineHeight: 1.5 }}>
          {description}
        </p>
        <span className="inline-flex items-center gap-2" style={{ fontFamily: 'Montserrat', fontSize: '16px', fontWeight: 700, color: '#000000' }}>
          {ctaText}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#000000" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </span>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user, isAuthenticated } = useAuth();
  const { permissions } = useProductMode();
  const { navigateToShop } = useShopNavigation();
  const { toast } = useToast();
  const { openLoginDrawer, openSignupDrawer } = useAuthDrawer();
  
  const [heroImageHovered, setHeroImageHovered] = useState(false);
  const [heroUrlDialogOpen, setHeroUrlDialogOpen] = useState(false);
  const [heroUrlInput, setHeroUrlInput] = useState("");
  const [heroUploading, setHeroUploading] = useState(false);
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = user?.role === 'admin';

  const { data: heroSetting, isPending: heroSettingPending } = useQuery<{ key: string; value: string | null }>({
    queryKey: ["/api/site-settings/heroImage"],
    queryFn: async () => {
      const res = await fetch("/api/site-settings/heroImage");
      return res.json();
    },
  });

  /** Resolved only after fetch — avoids flashing bundled default then swapping to API URL */
  const heroImageSrc =
    !heroSettingPending ? (heroSetting?.value || defaultHeroImage) : null;

  const heroUrlMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("PUT", "/api/site-settings/heroImage", { value: url });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site-settings/heroImage"] });
      toast({ title: "Hero image updated" });
      setHeroUrlDialogOpen(false);
      setHeroUrlInput("");
    },
    onError: () => {
      toast({ title: "Failed to update hero image", variant: "destructive" });
    }
  });

  const handleHeroFileUpload = async (file: File) => {
    setHeroUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch("/api/site-settings/hero-image/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.imageUrl) {
        queryClient.invalidateQueries({ queryKey: ["/api/site-settings/heroImage"] });
        toast({ title: "Hero image uploaded successfully" });
      } else {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setHeroUploading(false);
    }
  };

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["/api/brands"],
  });

  const activeBrands = brands.filter(brand => brand.isActive);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fffbf5] via-white to-[#fffbf5] hide-scrollbar overflow-y-auto">
      <section className="relative min-h-[50vh] sm:min-h-[60vh] lg:min-h-[70vh]">
        <div 
          className="relative w-full h-full"
          onMouseEnter={() => isAdmin && setHeroImageHovered(true)}
          onMouseLeave={() => isAdmin && setHeroImageHovered(false)}
        >
          {heroImageSrc ? (
            <img
              src={heroImageSrc}
              alt="Premium Sneaker Lifestyle"
              className="w-full h-[50vh] sm:h-[60vh] lg:h-[70vh] object-cover object-center"
              style={{ transformOrigin: "top center" }}
              data-testid="img-hero"
            />
          ) : (
            <div
              className="w-full h-[50vh] sm:h-[60vh] lg:h-[70vh] bg-neutral-800"
              aria-hidden
            />
          )}
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Admin hover overlay to change hero image */}
          {isAdmin && heroImageHovered && (
            <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center transition-opacity duration-300">
              <div className="flex gap-3">
                <button
                  onClick={() => heroFileInputRef.current?.click()}
                  disabled={heroUploading}
                  className="flex items-center gap-2 bg-white/90 hover:bg-white text-gray-900 px-5 py-2.5 rounded-lg shadow-lg font-medium text-sm transition-all hover:scale-105"
                >
                  {heroUploading ? (
                    <span className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-gray-900 rounded-full" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {heroUploading ? "Uploading..." : "Upload Image"}
                </button>
                <button
                  onClick={() => setHeroUrlDialogOpen(true)}
                  className="flex items-center gap-2 bg-white/90 hover:bg-white text-gray-900 px-5 py-2.5 rounded-lg shadow-lg font-medium text-sm transition-all hover:scale-105"
                >
                  <LinkIcon className="w-4 h-4" />
                  Paste URL
                </button>
              </div>
              <input
                ref={heroFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleHeroFileUpload(file);
                  e.target.value = '';
                }}
              />
            </div>
          )}

          {/* Admin camera icon badge (always visible for admin) */}
          {isAdmin && !heroImageHovered && (
            <div className="absolute top-4 right-4 z-10 bg-black/50 rounded-full p-2">
              <Camera className="w-5 h-5 text-white/70" />
            </div>
          )}

          {/* Hero URL dialog */}
          {heroUrlDialogOpen && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setHeroUrlDialogOpen(false)}>
              <div className="bg-white rounded-xl shadow-2xl p-6 w-[90vw] max-w-md" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Change Hero Image</h3>
                  <button onClick={() => setHeroUrlDialogOpen(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-500 mb-3">Paste an image URL below:</p>
                <Input
                  value={heroUrlInput}
                  onChange={(e) => setHeroUrlInput(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mb-4"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setHeroUrlDialogOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={() => heroUrlInput.trim() && heroUrlMutation.mutate(heroUrlInput.trim())}
                    disabled={!heroUrlInput.trim() || heroUrlMutation.isPending}
                    className="bg-[#FD4338] hover:bg-[#E62F2A] text-white"
                  >
                    {heroUrlMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </div>
          )}
          
          <div className="absolute inset-0 flex items-center px-4 sm:px-8 lg:px-16" style={{ transformOrigin: "bottom center" }}>
            <div className="pl-0 sm:pl-8 md:pl-12 lg:pl-[70px]">
              <h1 data-testid="text-hero-title" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                <span className="block font-extrabold text-white leading-[1.1] tracking-tight" style={{ fontSize: '39px' }}>Nation Hub</span>
                <span className="block font-bold mt-1" style={{ fontSize: '24px', color: '#FD4338', fontFamily: "'Montserrat', sans-serif" }}>Footwear Platform</span>
              </h1>
              <p className="mt-3 max-w-md font-normal leading-relaxed" style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '15px', color: '#FFFFFF' }}>
                Your trusted partner for quality wholesale footwear. Browse our extensive catalog and place orders with ease.
              </p>
              {!isAuthenticated && (
                <div className="flex flex-wrap justify-start gap-3 sm:gap-4 mt-6 sm:mt-8">
                  <Button 
                    onClick={openLoginDrawer}
                    className="bg-[#FD4338] hover:bg-[#E62F2A] text-black rounded-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300" 
                    style={{ width: '182.4px', height: '35.1px', padding: 0, fontFamily: "'Montserrat', sans-serif", fontSize: '15px', fontWeight: 400 }}
                    data-testid="button-hero-login"
                  >
                    Login
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={openSignupDrawer}
                    className="bg-[#C7D0CF] hover:bg-[#b5bebc] text-black border-[#C7D0CF] hover:border-[#b5bebc] rounded-sm shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300" 
                    style={{ width: '182.4px', height: '35.1px', padding: 0, fontFamily: "'Montserrat', sans-serif", fontSize: '15px', fontWeight: 400 }}
                    data-testid="button-hero-signup"
                  >
                    Signup
                  </Button>
                </div>
              )}
            </div>
          </div>
          {/* Logo at the boundary - centered between hero and section below */}
          <div 
            className="absolute z-10 pointer-events-none" 
            style={{ 
              width: '355.607px', 
              height: '332.098px', 
              left: '75%', 
              bottom: '0px', 
              transform: 'translate(-50%, 50%)' 
            }}
          >
            <img
              src={ASSET_URLS.nationHubLogoHero}
              alt="Nation Hub"
              className="w-full h-full object-contain"
              style={isAuthenticated ? {} : { filter: 'brightness(0)' }}
              draggable={false}
            />
          </div>
        </div>
      </section>

      {isAuthenticated && (
        <section className="w-full" style={{ backgroundColor: '#000000', padding: '60px 0 70px' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 data-testid="text-section-services" style={{ fontFamily: "'Acumin Variable Concept', sans-serif", fontSize: '45.8px', fontWeight: 600, fontStretch: 'semi-expanded', color: '#C7D0CF', marginBottom: '12px' }}>
                Two Ways to Order
              </h2>
              <p style={{ fontFamily: 'Montserrat', fontSize: '14px', fontWeight: 400, color: '#C7D0CF' }}>
                Choose the method that works best for your business needs
              </p>
            </div>
            
            <div className={`flex flex-wrap justify-center ${permissions.allowPreOrders ? 'gap-8' : ''}`}>
              <OrderMethodCard
                title="Order from Stock"
                description="Browse ready-to-ship inventory and get your products delivered within days."
                ctaText="Shop In-Stock"
                onClick={() => navigateToShop('stock')}
                cardBackgroundColor="#FD4338"
                icon={<Archive className="w-5 h-5" style={{ color: '#C7D0CF' }} />}
                iconBgColor="#000000"
                iconColor="#C7D0CF"
                iconBorder="1px solid rgba(199,208,207,0.3)"
                dataTestId="card-order-from-stock"
              />
              {permissions.allowPreOrders && (
                <OrderMethodCard
                  title="Pre-Order Collections"
                  description="Get exclusive access to upcoming releases and reserve your inventory before anyone else."
                  ctaText="Browse Pre-Orders"
                  onClick={() => navigateToShop('preorder')}
                  cardBackgroundColor="#C7D0CF"
                  icon={<Package className="w-5 h-5 text-white" />}
                  iconBgColor="#FD4338"
                  iconColor="white"
                  dataTestId="card-preorder"
                />
              )}
            </div>
          </div>
        </section>
      )}
      {activeBrands.length > 0 && (() => {
        const normSlug = (s: string) => s.toLowerCase().replace(/[\s-]/g, "");
        const brandOrder = ['nike', 'adidas', 'puma', 'reebok', 'newbalance', 'asics', 'timberland', 'geox', 'skechers', 'underarmour'];
        const ordered = brandOrder
          .map((slug) => activeBrands.find((b) => normSlug(b.slug) === slug))
          .filter(Boolean) as Brand[];
        const orderedIds = new Set(ordered.map((b) => b.id));
        const rest = activeBrands
          .filter((b) => !orderedIds.has(b.id))
          .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));
        const displayBrands = [...ordered, ...rest].slice(0, 10);
        return displayBrands.length > 0 ? (
          <section className="py-8 sm:py-12 lg:py-16" style={{ backgroundColor: '#f1f4f3' }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center mb-6 sm:mb-8 lg:mb-12">
                <h2 className="font-extrabold text-[#000000] mb-2 sm:mb-3" style={{ fontSize: '147px', lineHeight: 1 }} data-testid="text-section-brands">Brands</h2>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 252.8px))', gap: '16px', justifyContent: 'center' }}>
                {displayBrands.map((brand) => {
                  const logoSrc = getBrandLogoDisplayUrl(brand);
                  return (
                  <div 
                    key={brand.id}
                    className="rounded-xl"
                    style={{
                      height: '97.3px',
                      border: '1px solid #000000',
                      backgroundColor: '#f1f4f3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    data-testid={`brand-card-${brand.slug}`}
                  >
                    {logoSrc ? (
                      <img 
                        src={logoSrc} 
                        alt={brand.name} 
                        className="max-h-[55px] max-w-[200px] w-auto object-contain"
                        style={{ filter: 'brightness(0)' }}
                      />
                    ) : (
                      <span className="text-lg font-bold" style={{ color: '#000000' }}>{brand.name}</span>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null;
      })()}
      <footer className="bg-black pt-8 sm:pt-12 pb-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-8 sm:mb-10 flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-10 xl:gap-12">
            <div className="shrink-0 lg:max-w-sm">
              <div className="mb-3 sm:mb-4 flex items-center" style={{ minHeight: '20px' }}>
                <img 
                  src={ASSET_URLS.nationOutfittersAppbar} 
                  alt="Nation Outfitters" 
                  className="h-[50px] w-auto" 
                  style={{ filter: "invert(1) brightness(2)", mixBlendMode: "screen" }}
                  draggable={false} 
                />
              </div>
              <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
                Your trusted partner for premium wholesale footwear distribution.
              </p>
            </div>

            <div className="flex flex-1 flex-col sm:flex-row flex-wrap items-start gap-8 sm:gap-10 md:gap-12 lg:gap-16">
              {isAuthenticated && (
                <div>
                  <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm uppercase tracking-wider">Products</h4>
                  <ul className="space-y-2 sm:space-y-3">
                    {permissions.allowPreOrders && (
                      <li><button onClick={() => navigateToShop('preorder')} className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300">Pre-Orders</button></li>
                    )}
                    <li><button onClick={() => navigateToShop('stock')} className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300">In-Stock</button></li>
                  </ul>
                </div>
              )}

              {!isAuthenticated && (
                <div>
                  <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm uppercase tracking-wider">Company</h4>
                  <ul className="space-y-2 sm:space-y-3">
                    <li><Link href="/wholesale" className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300">About Us</Link></li>
                    <li><Link href="/contact" className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300">Contact</Link></li>
                  </ul>
                </div>
              )}

              <div>
                <h4 className="font-bold text-white mb-3 sm:mb-4 text-xs sm:text-sm uppercase tracking-wider">Legal</h4>
                <ul className="space-y-2 sm:space-y-3">
                  <li><a href="#" className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300" data-testid="link-terms">Terms of Service</a></li>
                  <li><a href="#" className="text-xs sm:text-sm text-gray-400 hover:text-[#FD4338] transition-colors duration-300" data-testid="link-privacy">Privacy Policy</a></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="pt-6 sm:pt-8 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-gray-500 text-xs sm:text-sm text-center sm:text-left">&copy; 2025 ShoeHub. All rights reserved.</p>
            <div className="flex items-center gap-3 sm:gap-4">
              <a href="#" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-800 hover:bg-[#FD4338] flex items-center justify-center transition-all duration-300" data-testid="link-contact">
                <Globe className="w-4 h-4 text-gray-400 hover:text-white" />
              </a>
              <a href="#" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-800 hover:bg-[#FD4338] flex items-center justify-center transition-all duration-300">
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </a>
              <a href="#" className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-800 hover:bg-[#FD4338] flex items-center justify-center transition-all duration-300">
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772A4.902 4.902 0 015.45 2.525c.636-.247 1.363-.416 2.427-.465C8.901 2.013 9.256 2 11.685 2h.63zm-.081 1.802h-.468c-2.456 0-2.784.011-3.807.058-.975.045-1.504.207-1.857.344-.467.182-.8.398-1.15.748-.35.35-.566.683-.748 1.15-.137.353-.3.882-.344 1.857-.047 1.023-.058 1.351-.058 3.807v.468c0 2.456.011 2.784.058 3.807.045.975.207 1.504.344 1.857.182.466.399.8.748 1.15.35.35.683.566 1.15.748.353.137.882.3 1.857.344 1.054.048 1.37.058 4.041.058h.08c2.597 0 2.917-.01 3.96-.058.976-.045 1.505-.207 1.858-.344.466-.182.8-.398 1.15-.748.35-.35.566-.683.748-1.15.137-.353.3-.882.344-1.857.048-1.055.058-1.37.058-4.041v-.08c0-2.597-.01-2.917-.058-3.96-.045-.976-.207-1.505-.344-1.858a3.097 3.097 0 00-.748-1.15 3.098 3.098 0 00-1.15-.748c-.353-.137-.882-.3-1.857-.344-1.023-.047-1.351-.058-3.807-.058zM12 6.865a5.135 5.135 0 110 10.27 5.135 5.135 0 010-10.27zm0 1.802a3.333 3.333 0 100 6.666 3.333 3.333 0 000-6.666zm5.338-3.205a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4z" clipRule="evenodd" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
