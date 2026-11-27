// The Championship bought on a phone (purchase.ts, through Unity IAP 4.8 or later in place of cordova-plugin-purchase:
// only when it's in the project, README "Platforms"): the "championship" one-time product, the same one the Capacitor
// app sells (Play Console, App Store Connect), so a player who bought it there has it here. Checked against the store
// at each start: owned, it's yours (and kept, progress.championship); a purchase the store no longer lists while it
// offers it for sale again (a refund) takes it back; a store that can't be reached takes nothing away.
#if UNITY_PURCHASING
using System;
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.Purchasing;
using UnityEngine.Purchasing.Extension;

namespace CornerCutters.Game
{
    public sealed class StoreShop : IShop, IDetailedStoreListener
    {
        IStoreController controller;
        IExtensionProvider extensions;
        Action<bool> buying;

        public bool Ready { get; private set; }
        public string Price { get; private set; }
        public string Error { get; private set; }

        static string StoreName => Application.platform == RuntimePlatform.IPhonePlayer ? "THE APP STORE" : "GOOGLE PLAY";

        public StoreShop()
        {
            var builder = ConfigurationBuilder.Instance(StandardPurchasingModule.Instance());
            builder.AddProduct(Paywall.ChampionshipProduct, ProductType.NonConsumable);
            UnityPurchasing.Initialize(this, builder);
        }

        Product Championship => controller?.products.WithID(Paywall.ChampionshipProduct);

        public void OnInitialized(IStoreController c, IExtensionProvider e)
        {
            controller = c;
            extensions = e;
            var p = Championship;
            Price = p?.metadata?.localizedPriceString;
            Ready = p != null && (p.availableToPurchase || p.hasReceipt);
            if (p != null && p.hasReceipt) Platforms.Bought = true;
            // (reached cleanly, on sale again, and not owned: refunded or voided)
            else if (p != null && p.availableToPurchase && Platforms.Bought) Platforms.Bought = false;
            if (p == null || !p.availableToPurchase && !p.hasReceipt) Error = Lang.T("THE CHAMPIONSHIP ISN’T ON SALE ON {store} YET", "store", StoreName);
        }

        public void OnInitializeFailed(InitializationFailureReason why) => OnInitializeFailed(why, null);

        public void OnInitializeFailed(InitializationFailureReason why, string message)
        {
            string reason = (message ?? why.ToString()).ToUpperInvariant();
            if (reason.Length > 120) reason = reason.Substring(0, 120);
            Error = Lang.T("{store} ISN’T AVAILABLE HERE ({reason})", "store", StoreName, "reason", reason);
        }

        public PurchaseProcessingResult ProcessPurchase(PurchaseEventArgs e)
        {
            if (e.purchasedProduct.definition.id == Paywall.ChampionshipProduct)
            {
                Platforms.Bought = true;
                Save.Flush(true);
                Done(true);
            }
            return PurchaseProcessingResult.Complete;
        }

        public void OnPurchaseFailed(Product p, PurchaseFailureReason why)
        {
            // (backing out of it is no error to show)
            if (why != PurchaseFailureReason.UserCancelled) Error = $"{StoreName}: {why.ToString().ToUpperInvariant()}";
            Done(false);
        }

        public void OnPurchaseFailed(Product p, PurchaseFailureDescription d)
        {
            if (d.reason != PurchaseFailureReason.UserCancelled) Error = $"{StoreName}: {(d.message ?? d.reason.ToString()).ToUpperInvariant()}";
            Done(false);
        }

        void Done(bool ok)
        {
            var b = buying;
            buying = null;
            b?.Invoke(ok);
        }

        public void Buy(Action<bool> done)
        {
            var p = Championship;
            if (p == null || !p.availableToPurchase) { done(false); return; }
            buying = done;
            controller.InitiatePurchase(p);
        }

        public void Restore(Action<bool> done)
        {
            if (extensions == null) { done(Platforms.Bought); return; }
            void Back(bool ok, string _)
            {
                if (Championship?.hasReceipt == true) Platforms.Bought = true;
                done(Platforms.Bought);
            }
            if (Application.platform == RuntimePlatform.IPhonePlayer) extensions.GetExtension<IAppleExtensions>().RestoreTransactions(Back);
            else extensions.GetExtension<IGooglePlayStoreExtensions>().RestoreTransactions(Back);
        }
    }
}
#endif
