import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShopDecor, ShopDecorDocument } from '../entities/shop-decor.schema';

export interface UpsertShopDecorPayload {
  shopName?: string;
  slogan?: string;
  logoUrl?: string;
  bannerUrl?: string;
  accentColor?: string;
  navItems?: string[];
  introTitle?: string;
  introDescription?: string;
  featuredCategories?: string[];
}

@Injectable()
export class ShopDecorRepository {
  constructor(
    @InjectModel(ShopDecor.name)
    private readonly shopDecorModel: Model<ShopDecorDocument>
  ) {}

  async findBySellerId(sellerId: string): Promise<ShopDecorDocument | null> {
    return this.shopDecorModel.findOne({ sellerId }).lean<ShopDecorDocument | null>().exec();
  }

  async upsertBySellerId(sellerId: string, payload: UpsertShopDecorPayload): Promise<ShopDecorDocument> {
    return this.shopDecorModel
      .findOneAndUpdate(
        { sellerId },
        {
          $set: payload,
          $setOnInsert: { sellerId }
        },
        {
          upsert: true,
          new: true,
          lean: true
        }
      )
      .exec() as Promise<ShopDecorDocument>;
  }
}
