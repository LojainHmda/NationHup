// Size standards with their respective sizes
export const SIZE_STANDARDS = {
  EU: ["35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48"],
  US: ["4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15"],
  UK: ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
} as const;

export type SizeStandard = keyof typeof SIZE_STANDARDS;

// Filter constants based on user requirements
// Two separate filter sections:
// Gender: Male, Female
// Age Group: Adult, Junior, Kids, Infant
export const FILTER_OPTIONS = {
  // Division/Department filter
  divisions: [
    "Footwear",
    "Apparel",
    "Accessories"
  ],
  styles: [
    "Running",
    "Lifestyle/Casual", 
    "Training/Fitness",
    "Basketball",
    "Soccer/Football",
    "Skateboarding"
  ],
  // Gender filter options
  mainCategories: [
    "Male",
    "Female",
    "Unisex"
  ],
  // Kids Gender (kept for backward compatibility)
  kidsGenders: [
    "Male",
    "Female",
    "Unisex"
  ],
  // Age Group filter options
  kidsAgeGroups: [
    "Adult",
    "Junior",
    "Kids",
    "Infant"
  ],
  // Alias for backward compatibility with FilterSidebar
  ageRanges: [
    "Adult",
    "Junior",
    "Kids",
    "Infant"
  ],
  occasions: [
    "Casual",
    "Sports",
    "Outdoor", 
    "Indoor",
    "Party",
    "Formal"
  ],
  // Gender options
  genders: [
    "Male",
    "Female",
    "Unisex"
  ],
  supplierLocations: [
    "China",
    "Vietnam",
    "Turkey", 
    "Italy",
    "Indonesia",
    "Thailand",
    "Brazil",
    "India"
  ],
  colors: [
    "Black",
    "White",
    "Red",
    "Blue", 
    "Green",
    "Gray",
    "Brown",
    "Yellow",
    "Orange",
    "Pink",
    "Purple",
    "Other"
  ]
};

// Icons mapping for each filter category (using Lucide React icons)
export const FILTER_ICONS = {
  styles: "Zap", // Running/sports activity
  ageRanges: "Users", // Age groups
  occasions: "Calendar", // Different occasions  
  genders: "User", // Gender
  supplierLocations: "MapPin", // Location
  colors: "Palette" // Colors
};

// Filter labels for display
export const FILTER_LABELS = {
  styles: "Style",
  ageRanges: "Age Range", 
  occasions: "Occasion",
  genders: "Gender",
  supplierLocations: "Supplier Location",
  colors: "Color"
};