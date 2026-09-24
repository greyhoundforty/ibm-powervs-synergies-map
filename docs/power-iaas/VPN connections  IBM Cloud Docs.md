Source: [VPN connections](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-vpn-connections)



IBM Power Virtual Server in

___

The Virtual Private Cloud (VPC) provided Virtual Private Network (VPN) service provides private and low-cost connectivity to the IBM Cloud services for improved reliability and high availability. You can use the Secure Shell (SSH) and other client-managed applications that are running on your host to access your virtual server instances through private IP addresses.

IBM Cloud offers the following two VPN options:

-   _VPN for VPC_ for site-to-site gateways to safely and securely connect from client-managed environment to resources in VPC, Power, and classic infrastructure.
-   _Client VPN for VPC_ for client-to-site servers that allow remote devices to secretly connect to the VPC network in a secure manner.

Important: On 14 July 2025, the Power Virtual Server VPNaaS product reached its end of life and is no longer available for use. If you are using Power Virtual Server VPNaaS product, you are encouraged to move to the IBM Cloud VPC VPN to avoid VPN service interruptions. For assistance to upgrade or migrate to IBM Cloud VPC VPN, open a [support ticket (opens in a new tab)](https://www.ibm.com/cloud/support) or engage with your Customer Support Manager (CSM).

For more information about the available VPN options, see the VPC documentation on [VPNs for VPC overview](https://cloud.ibm.com/docs/vpc?topic=vpc-vpn-overview).

## Creating a Virtual Private Cloud VPN connection

Complete the following steps for creating a VPC VPN connection:

1.  Create a VPC resource.
2.  Create a Site-to-Site VPN gateway in VPC.
3.  Attach the VPN connection to the Power Virtual Server workspace by using one of the following methods:
    -   Use a Transit Gateway in a Power Edge Router (PER) workspace.
    -   Use a Cloud connection in a non-PER workspace.

Note: It is recommended that you create a direct cloud connection between the VPC and the Power Virtual Server. Adding a Transit Gateway is feasible, but it incurs extra charges. The cloud connection setup is not required in a PER-enabled workspace.

### Architecture diagram

### Configuring VPC VPN in a PER workspace

![VPC VPN in PER architecture diagram](https://cloud.ibm.com/docs/api/docs-content/v4/content/d8be74103bf42298e4f99e5154d00e9419e068e7/power-iaas/images/vpc_vpn_per.svg "Configuring VPC VPN in a PER workspace")

Figure 1. Configuring VPC VPN in a PER workspace

1.  Define the client-managed subnet in the address prefix for the VPC.
2.  Define a routing table with Transit Gateway and VPN gateway.

### Configuring VPC VPN in a non-PER workspace

![VPC VPN in non-PER architecture diagram](https://cloud.ibm.com/docs/api/docs-content/v4/content/d8be74103bf42298e4f99e5154d00e9419e068e7/power-iaas/images/vpc_vpn_legacy.svg "Configuring VPC VPN in a non-PER workspace")

Figure 2. Configuring VPC VPN in a non-PER workspace

1.  Define the client-managed subnet in the address prefix for the VPC.
2.  Define a routing table with Direct Link and VPN gateway.
3.  Attach Direct Link to workspace subnet.
4.  You can choose to attach a Transit Gateway along with the Direct Link, but it incurs extra charges.

Procedure

1.  Create a VPC resource. Complete the steps that are documented in [Using the IBM Cloud console to create VPC resources](https://cloud.ibm.com/docs/vpc?topic=vpc-creating-a-vpc-using-the-ibm-cloud-console).
    
2.  Create a Site-to-Site VPN gateway in VPC. Complete the steps documented in [About site-to-site VPN gateways](https://cloud.ibm.com/docs/vpc?topic=vpc-using-vpn).
    
    Note: To create a VPN connection, use a policy-based VPN.
    
3.  Attach the VPN connection to the Power Virtual Server workspace. Use one of the following procedures that suit your needs:
    
    -   For a PER-enabled workspace, see: [Attaching Transit Gateway to a PER workspace](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-per#migrate-per).
    -   For a non-PER enabled workspace, see: [Creating IBM Cloud connections](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-cloud-connections).

### Considerations for configuring VPC VPN in a non-PER workspace

You must note the following considerations when you configure VPC VPN in a non-PER workspace:

-   Use a policy-based VPN when you configure the VPN connections.
-   Add the subnets that are created in the Power Virtual Server to the following lists:
    -   Local Classless Inter-Domain Routing (CIDR) list of IBM Cloud VPC
    -   Peer CIDR list of IBM Cloud VPC in your client-managed environment
-   Enable VPN gateway and traffic source for Direct Link and transit gateway in the Edit Traffic window under the routing table of IBM Cloud VPC.
-   Complete one of the following configurations:
    -   Select Direct Link that is enabled with transit gateway in the Edit Traffic window under the routing table of IBM Cloud VPC.
    -   Disable the configuration for different Power Virtual Server workspaces that are in the same region.

### Changing from VPNaaS to the VPC VPN service

To use the VPC VPN service, you must switch from Power Virtual Server VPN as a service (VPNaaS) to the VPC VPN service. The following use case illustrates the steps to set up the VPC VPN connection and confirms that the VPC VPN service is enabled:

1.  Create a VPC connection in the same data center as the Power Virtual Server by using the same account as Power Virtual Server. Complete the following configurations:
    
    1.  Select the `VPN server` and `VPN gateway` values for **Accepts routes from** to configure the default routing table. This configuration allows the traffic between the virtual servers that are members of the VPC subnet and the devices on the remote VPN connection.
    2.  Create a second routing table to complete the following configurations:
        1.  Select the values for VPN server, VPN gateway, and transit gateway.
        2.  Select **Advertise to** under Transit Gateway.
    
    For more information, see [Getting started with Virtual Private Cloud (VPC) (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-getting-started).
    
2.  Create a VPN connection between the VPC and the remote connection of the existing VPNaaS. Complete the following steps:
    
    1.  Add the workspace CIDRs to the list of local CIDRs in the VPN connection.
    2.  Add the workspace CIDRs to the peer CIDRs list in the remote VPNaaS connection.
    
    You must condider the following conditions when you create the VPN connection:
    
    -   Use a policy-based VPN in all the configurations of the VPN connection.
    -   Subnets for the remote VPN, VPC, and workspace must be distinct.
    -   Subnets cannot be shared or overlapped.
    
    For more information about VPN options, see [About site-to-site VPN gateways (opens in a new tab)](https://cloud.ibm.com/docs/vpc?topic=vpc-using-vpn).
    
3.  Create a transit gateway by completing the following steps:
    
    1.  Add VPC to Transit Gateway.
    2.  Click **Create** under **Routing tables** to create a routing table. You can see the list of VPC, CIDR, and the CIDR for the remote VPN.
    
    For more information about transit gateways, see [Getting started with IBM Cloud Transit Gateway (opens in a new tab)](https://cloud.ibm.com/docs/transit-gateway?topic=transit-gateway-getting-started).
    
    Consider the following assumptions and start the switch from VPNaas to VPC VPN:
    
    -   The connectivity between a virtual server on the VPC and a system on the remote VPN is working.
        
    -   The CIDRs are advertised through the transit gateway.
        
        Note: The workspace and the remote VPN are not connected until the switch to VPC VPN is completed.
        
4.  Delete the VPNaaS gateway. You must select the VPNaaS connections that are attached to the workspace.
    
5.  Migrate the workspace to PER. You must remove the active cloud connections attached to the workspace on the other subnets. For more information, see [Migrating to PER](https://cloud.ibm.com/docs/power-iaas?topic=power-iaas-per#migrate-per).
    
6.  Connect to the transit gateway after the workspace is PER-enabled.
    
7.  Verify that CIDRs appear in the routing table. Complete the following steps to verify CIDRs:
    
    1.  Generate the routing table from the **IBM Cloud** console > **Infrastructure** > **Network** > **Routing tables**.
    2.  Select the VPC associated with your VPN gateway.
    3.  Click the name of the routing table that you want to use.
    4.  Verify that the CIDRs for the workspace appear with the existing CIDRs in the routing table.

### Additional information

-   [Connecting IBM VPC to IBM Power Virtual Servers and IBM Cloud Object Storage (opens in a new tab)](https://www.ibm.com/blog/connecting-ibm-vpc-to-ibm-power-virtual-servers-and-ibm-cloud-object-storage/).