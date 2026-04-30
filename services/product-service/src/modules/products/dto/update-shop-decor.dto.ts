import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShopDecorDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  slogan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  accentColor?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  navItems?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  introTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  introDescription?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featuredCategories?: string[];
}
